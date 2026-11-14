import {optionalDeletionReason} from './classWorkspace.mjs';
import {coordinatorCatalog,COORDINATOR_ACTIONS,coordinatorOnly} from './coordinatorPolicy';
import { deletionArchiveDates, archiveAvailable } from "./archiveRetention.mjs";
import { requireDeletionPassword } from "./deletionAuthorization";
import crypto from "node:crypto";
import { prisma } from "./prisma";
import { learnerHistoryInclude, sealPrivateData, openPrivateData, writeAudit } from "./adminHistory";
import { UUID_PATTERN, schoolYearLabel, sectionName, workspaceError, classLifecyclePhrase, learnerNameKey } from "./classWorkspace.mjs";
export async function requireClass(db, teacherId, id, writable = false, includeDormant = false) {
  if (!UUID_PATTERN.test(String(id || ""))) throw workspaceError("Choose a school year and section first.");
  if (writable && includeDormant) throw workspaceError("Choose an active section to make changes.", 409);
  const section = await db.classSection.findFirst({
    where: {
      id,
      teacherId,
      ...(includeDormant ? {} : {unassignedAt: null})
    },
    include: {
      schoolYear: {include:{definition:{select:{deletedAt:true}}}}
    }
  });
  if (!section || section.deletedAt || section.schoolYear.deletedAt || section.schoolYear.definition?.deletedAt) throw workspaceError("This class is unavailable for your account.", 404);
  if (writable && (section.archivedAt || section.schoolYear.archivedAt)) throw workspaceError("This section is archived. Choose an active section to make changes.", 409);
  return section;
}
export async function lockClass(tx, teacherId, id, writable = true, includeDormant = false) {
  if (!UUID_PATTERN.test(String(id || ""))) throw workspaceError("Choose a school year and section first.");
  await tx.$queryRaw`SELECT id FROM public.class_sections WHERE id=${id}::uuid AND teacher_id=${teacherId} FOR UPDATE`;
  return requireClass(tx, teacherId, id, writable, includeDormant);
}
export async function assertRosterVersion(db, teacherId, value) {
  await db.$queryRaw`SELECT id FROM public.users WHERE id=${teacherId} FOR UPDATE`;
  const owner = await db.user.findUnique({
    where: {
      id: teacherId
    },
    select: {
      learnerDataVersion: true
    }
  });
  if (!owner || Number(value ?? 0) !== owner.learnerDataVersion) throw Object.assign(workspaceError("The class roster was reset. Refresh the teacher app before adding learners.", 409), {
    code: "ROSTER_RESET"
  });
}
export const archiveSelect = {
  id: true,
  schoolYearLabel: true,
  sectionName: true,
  learnerCount: true,
  createdAt: true,
  sourceSectionId: true,
  sourceSchoolYearId: true,
  sectionCount: true,
  kind: true,
  sourceLearnerId: true,
  learnerName: true,
  deletionGroupId: true,
  deletedAt:true, expiresAt:true, purgedAt:true, memberArchiveIds:true,
  restoredAt: true,
  restoredSectionId: true
};
export async function classCatalog(teacherId, includeArchives = false) {
  const [years, classes, archives, owner] = await Promise.all([prisma.schoolYear.findMany({
    include:{definition:{select:{deletedAt:true}}},
    where: {
      teacherId
    },
    orderBy: {
      startYear: "asc"
    }
  }), prisma.classSection.findMany({
    where: {
      teacherId
    },
    orderBy: {
      name: "asc"
    },
    include: {
      _count: {
        select: {
          learners: true
        }
      }
    }
  }), prisma.classArchive.findMany({
    where: {
      teacherId
    },
    select: archiveSelect,
    orderBy: {
      createdAt: "desc"
    }
  }), prisma.user.findUnique({
    where: {
      id: teacherId
    },
    select: {
      learnerDataVersion: true
    }
  })]);
  const visibleYears=years.filter(x=>!x.deletedAt&&!x.definition?.deletedAt),visibleIds=new Set(visibleYears.map(x=>x.id));
  return {
    status: "ok",
    ...await coordinatorCatalog(teacherId,visibleYears),
    schoolYears: visibleYears,
    sections: classes.filter(x=>!x.deletedAt&&!x.unassignedAt&&visibleIds.has(x.schoolYearId)),
    deletedYearIds: years.filter(x=>x.deletedAt||x.definition?.deletedAt).map(x=>x.id),
    deletedSectionIds: classes.filter(x=>x.deletedAt||x.unassignedAt||!visibleIds.has(x.schoolYearId)).map(x=>x.id),
    archives:(includeArchives?archives:[]).filter(item=>archiveAvailable(item)).map(item=>{
      if(item.kind!=="school_year"||!item.memberArchiveIds?.length)return item;
      const members=archives.filter(child=>item.memberArchiveIds.includes(child.id)&&archiveAvailable(child));
      return {...item,sectionCount:members.length,learnerCount:members.reduce((n,child)=>n+child.learnerCount,0)};
    }),
    serverNow:new Date().toISOString(),
    roster_version: owner?.learnerDataVersion ?? 0
  };
}
function pick(row, fields) {
  return Object.fromEntries(fields.filter(k => row[k] !== undefined).map(k => [k, row[k]]));
}
function operationId(value) {
  if (!UUID_PATTERN.test(String(value || ""))) throw workspaceError("A valid operation identifier is required.");
  return value;
}
async function lockedYear(tx, teacherId, id) {
  operationId(id);
  await tx.$queryRaw`SELECT id FROM public.school_years WHERE id=${id}::uuid AND teacher_id=${teacherId} FOR UPDATE`;
  const year = await tx.schoolYear.findFirst({
    include:{definition:{select:{deletedAt:true}}},
    where: {
      id,
      teacherId
    }
  });
  if (!year || year.definition?.deletedAt) throw workspaceError("This school year is unavailable for your account.", 404);
  return year;
}
function sectionArchiveId(operation, sectionId) {
  const chars = crypto.createHash("sha256").update(`crl-section-archive:${operation}:${sectionId}`).digest("hex").slice(0, 32).split("");
  chars[12] = "8";
  chars[16] = "8";
  const v = chars.join("");
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20)}`;
}
async function archiveSection(tx, teacherId, section, id, version, retention=null) {
  const existing = await tx.classArchive.findUnique({
    where: {
      id
    }
  });
  if (existing) {
    if (existing.teacherId !== teacherId || existing.sourceSectionId !== section.id) throw workspaceError("Archive identifier is already in use.", 409);
    if(existing.purgedAt)throw workspaceError("This backup was permanently deleted. Refresh before retrying.",409);
    if(retention&&!existing.expiresAt)return tx.classArchive.update({where:{id:existing.id},data:retention});
    return existing;
  }
  const retained = section.archivedAt && await tx.classArchive.findFirst({
    where: {
      teacherId,
      sourceSectionId: section.id,
      kind: "section"
    }
  });
  if(retained&&archiveAvailable(retained))return retention&&!retained.expiresAt?tx.classArchive.update({where:{id:retained.id},data:retention}):retained;
  const live = await tx.hostSession.count({
    where: {
      teacherId,
      learner: {
        classSectionId: section.id
      },
      ended: false,
      linkedAt: {not: null},
      stage: {notIn: ["completed", "terminated", "teacher_review"]}
    }
  });
  if (live) throw workspaceError("End all assessments in this section before archiving or deleting.", 409);
  const learners = await tx.learner.findMany({
    where: {
      teacherId,
      classSectionId: section.id
    },
    include: {
      assessmentSessions: {
        include: {
          ...learnerHistoryInclude.assessmentSessions.include,
          hostSessions: {
            select: {
              storyTitle: true,
              catalogRevisionId: true
            },
            orderBy: {
              updatedAt: "desc"
            },
            take: 1
          }
        }
      }
    },
    orderBy: {
      id: "asc"
    }
  });
  const snapshot = {
    kind: "class_archive",
    version: 1,
    archiveId: id,
    teacherId,
    rosterVersion: Number(version ?? 0),
    schoolYear: section.schoolYear.label,
    section: section.name,
    createdAt: new Date().toISOString(),
    learners
  };
  const sealed = sealPrivateData(snapshot);
  if (sealed.length > 3 * 1024 * 1024) throw workspaceError("This section is too large for a single archive. No records have been removed.", 413);
  const archive = await tx.classArchive.create({
    data: {
      id,
      teacherId,
      sourceSectionId: section.id,
      schoolYearLabel: section.schoolYear.label,
      sectionName: section.name,
      learnerCount: learners.length,
      kind: "section",
      ...(retention||{}),
      encryptedSnapshot: sealed
    }
  });
  await tx.classSection.update({
    where: {
      id: section.id
    },
    data: {
      archivedAt: new Date()
    }
  });
  await writeAudit(tx, {
    actorId: teacherId,
    event: "class.archived",
    count: learners.length,
    detail: {
      classSectionId: section.id,
      archiveId: id
    }
  });
  return archive;
}
async function restoreSectionLearners(tx, teacherId, section, snapshot) {
  const restored = [];
  for (const row of snapshot.learners) {
    const learner = await tx.learner.create({
      data: {
        ...pick(row, ["lrn", "firstName", "middleName", "lastName", "suffix", "sex", "gradeLevel"]),
        teacherId,
        classSectionId: section.id,
        section: section.name
      }
    });
    restored.push(learner.id);
    for (const record of row.assessmentSessions || []) {
      const data = {
        ...pick(record, ["assessmentPeriod", "dateAdministered", "overallClassification", "isCompleted"]),
        teacherId,
        learnerId: learner.id
      };
      if (record.sessionMetrics) data.sessionMetrics = {
        create: pick(record.sessionMetrics, ["task1Score", "task2Score", "totalMiscues", "miscueAccuracy", "comprehensionScore", "timerSeconds", "classificationLabel", "experienceRating", "observationLevel", "remarks"])
      };
      for (const key of ["letterResults", "wordResults", "passageMiscues", "comprehensionResults"]) {
        if (record[key]?.length) data[key] = {
          create: record[key].map(result => Object.fromEntries(Object.entries(result).filter(([field]) => field !== "id" && field !== "sessionId")))
        };
      }
      const saved = await tx.assessmentSession.create({
        data
      });
      if (record.hostSessions?.[0]?.storyTitle) await tx.hostSession.create({
        data: {
          code: Array.from({
            length: 6
          }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[crypto.randomInt(32)]).join(""),
          teacherId,
          learnerId: learner.id,
          assessmentSessionId: saved.id,
          storyTitle: record.hostSessions[0].storyTitle,
          catalogRevisionId: record.hostSessions[0].catalogRevisionId || null,
          stage: "completed",
          ended: true
        }
      });
    }
  }
  return restored;
}
async function importYear(tx, teacherId, label, requestedId) {
  if (requestedId) return lockedYear(tx, teacherId, requestedId);
  const startYear = Number(String(label).slice(0, 4));
  if (schoolYearLabel(startYear) !== label) throw workspaceError("Invalid school year in the archive.");
  const existing = await tx.schoolYear.findFirst({where:{teacherId,startYear,deletedAt:null}});
  if (existing) return lockedYear(tx, teacherId, existing.id);
  await tx.globalSchoolYear.upsert({where:{startYear},create:{startYear,label},update:{deletedAt:null}});
  const assigned=await tx.schoolYear.findFirst({where:{teacherId,startYear,deletedAt:null}});
  return assigned?lockedYear(tx,teacherId,assigned.id):tx.schoolYear.create({data:{id:crypto.randomUUID(),teacherId,startYear,label}});
}
export async function readDeletedLearnerArchives(db, teacherId, ids) {
  if(!Array.isArray(ids)||!ids.length||ids.length>500||new Set(ids).size!==ids.length||ids.some(id=>!UUID_PATTERN.test(String(id))))throw workspaceError("Choose 1 to 500 learner archives.");
  const rows=await db.classArchive.findMany({where:{id:{in:ids},teacherId,kind:"learner"}});
  if(rows.length!==ids.length||rows.some(row=>!archiveAvailable(row)))throw workspaceError("A selected learner archive expired or is unavailable.",410);
  return rows.map(row=>{let snapshot;try{snapshot=openPrivateData(row.encryptedSnapshot);}catch{throw workspaceError("This learner backup could not be opened. Contact your administrator.",409);}if(snapshot.teacherId!==teacherId||snapshot.archiveKind!=="learner"||snapshot.archiveId!==row.id)throw workspaceError("Invalid learner backup.",403);return {archive:row,snapshot};});
}
export async function importDeletedLearnerBackup(db, teacherId, backup, destination, rosterVersion) {
  let snapshots;
  try {
    if(backup?.format==='crl-learner-backup'&&backup.version===1){const payload=openPrivateData(backup.sealed);if(payload.kind!=='learner_backup'||payload.teacherId!==teacherId)throw Error();snapshots=payload.archives;}
    else if(backup?.format==='crl-class-archive'&&backup.version===1){snapshots=[openPrivateData(backup.sealed)];}
    else throw Error();
  }catch{throw workspaceError("Choose an original learner backup from this teacher account.",403);}
  if(!Array.isArray(snapshots)||!snapshots.length||snapshots.length>500||snapshots.some(s=>s.teacherId!==teacherId||s.archiveKind!=="learner"||s.version!==1||!Array.isArray(s.learners)||s.learners.length!==1||!UUID_PATTERN.test(s.archiveId)))throw workspaceError("Invalid learner backup.",403);
  await assertRosterVersion(db,teacherId,rosterVersion);
  const section=await lockClass(db,teacherId,destination);
  let imported=0,skipped=0;
  const enrolled=await db.learner.findMany({where:{teacherId,classSectionId:section.id},select:{lrn:true,firstName:true,middleName:true,lastName:true,suffix:true}});
  const lrns=new Set(enrolled.map(row=>row.lrn)),names=new Set(enrolled.map(learnerNameKey));
  for(const snapshot of snapshots){
    if(Number(snapshot.rosterVersion??0)!==Number(rosterVersion??0))throw workspaceError("This backup predates a permanent roster reset.",409);
    const row=snapshot.learners[0];
    if(lrns.has(row.lrn)||names.has(learnerNameKey(row))){skipped++;continue;}
    const sameYear=snapshot.schoolYear===section.schoolYear.label;
    await restoreSectionLearners(db,teacherId,section,{...snapshot,learners:[{...row,assessmentSessions:sameYear?row.assessmentSessions||[]:[]}]});lrns.add(row.lrn);names.add(learnerNameKey(row));imported++;
  }
  if(imported)await writeAudit(db,{actorId:teacherId,event:"learners.backup_imported",count:imported,detail:{classSectionId:section.id}});
  return {status:"ok",imported_count:imported,skipped_count:skipped};
}
async function restoreLearnerArchives(tx, teacherId, ids, destination, rosterVersion, uploaded=null) {
  await assertRosterVersion(tx, teacherId, rosterVersion);
  const section = await lockClass(tx, teacherId, destination);
  let restored = 0, acknowledged = 0;
  for (const id of [...ids].sort()) {
    operationId(id);
    await tx.$queryRaw`SELECT id FROM public.class_archives WHERE id=${id}::uuid AND teacher_id=${teacherId} FOR UPDATE`;
    const archive = await tx.classArchive.findFirst({where:{id,teacherId}});
    if (!archive || archive.kind !== "learner") throw workspaceError("Choose this teacher's own learner archives.",403);
    if(!uploaded&&!archiveAvailable(archive))throw workspaceError("This archive expired or was permanently deleted.",410);
    if (archive.restoredAt) { acknowledged++; continue; }
    let snapshot;
    try {snapshot=uploaded||openPrivateData(archive.encryptedSnapshot);} catch {throw workspaceError("This learner backup is damaged or changed.");}
    if (snapshot.teacherId !== teacherId || snapshot.archiveKind !== "learner" || snapshot.archiveId !== id || snapshot.version !== 1 || !Array.isArray(snapshot.learners) || snapshot.learners.length !== 1) throw workspaceError("Invalid learner archive.");
    if (Number(snapshot.rosterVersion ?? 0) !== Number(rosterVersion ?? 0)) throw workspaceError("This archive predates a permanent account roster reset and cannot be restored.",409);
    const row=snapshot.learners[0];
    if (Number(row.id) !== Number(archive.sourceLearnerId)) throw workspaceError("The learner archive identity does not match.",409);
    if (await tx.learner.count({where:{teacherId,classSectionId:section.id,lrn:row.lrn}})) throw workspaceError("A selected learner is already enrolled in the destination section. No selected learners were restored.",409);
    await restoreSectionLearners(tx,teacherId,section,snapshot);
    await tx.classArchive.update({where:{id},data:{restoredAt:new Date(),restoredSectionId:section.id}});
    restored++;
  }
  if (restored) await writeAudit(tx,{actorId:teacherId,event:"learners.restored",count:restored,detail:{archiveIds:ids,classSectionId:section.id}});
  return {imported_count:restored,already_restored_count:acknowledged};
}
async function assertStoredRestore(tx,teacherId,body){
  if(!body.archive_id)return;
  const id=operationId(body.archive_id);
  await tx.$queryRaw`SELECT id FROM public.class_archives WHERE id=${id}::uuid AND teacher_id=${teacherId} FOR UPDATE`;
  const row=await tx.classArchive.findFirst({where:{id,teacherId}});
  if(!row||!archiveAvailable(row))throw workspaceError("This archive expired or was permanently deleted.",410);
  for(const member of body.restore_member_ids||[]){
    await tx.$queryRaw`SELECT id FROM public.class_archives WHERE id=${member}::uuid AND teacher_id=${teacherId} FOR UPDATE`;
    const child=await tx.classArchive.findFirst({where:{id:member,teacherId}});
    if(!child||!archiveAvailable(child))throw workspaceError("A section backup changed or expired. Open the archive again.",410);
  }
}
async function exportArchive(db,teacherId,archive){
  if(archive.kind!=="school_year")return archive.encryptedSnapshot;
  const snapshot=openPrivateData(archive.encryptedSnapshot);
  if(!snapshot.memberReferences)return archive.encryptedSnapshot;
  const sections=[];
  for(const id of archive.memberArchiveIds||[]){
    const row=await db.classArchive.findFirst({where:{id,teacherId}});
    if(row&&archiveAvailable(row)&&row.kind==="section")sections.push({name:row.sectionName,learnerCount:row.learnerCount,sealed:row.encryptedSnapshot});
  }
  const {memberReferences,...header}=snapshot;
  return sealPrivateData({...header,sections});
}
function validateLifecycle(action, target, body, hasContents = true, passwordVerified = false, optionalReason = false) {
  const deleting=action.startsWith("delete_");
  if (deleting && !hasContents && body.empty_confirmation === true) return;
  if (deleting && hasContents && body.empty_confirmation === true) throw workspaceError("This container now has records. Refresh the list and confirm deletion with your account password.",409);
  if (deleting) {
    if (!passwordVerified || body.completed_ack !== true) throw workspaceError("Confirm your account password and that all devices are synchronized.");
    if(optionalReason)optionalDeletionReason(body);
    else if(typeof body.deletion_reason!=="string"||body.deletion_reason.trim().length<5||body.deletion_reason.trim().length>300)throw workspaceError("Provide a deletion reason of 5 to 300 characters.");
  } else if (body.confirmation !== classLifecyclePhrase(action,target) || body.completed_ack !== true) throw workspaceError("Confirm all devices are synchronized and type the archive phrase exactly.");
}

export async function handleClassAction(action, teacherId, body = {}, query = null, actor = null) {
  const coordinator=['admin','reading_coordinator'].includes(actor?.role);
  const teacherLearnerArchive = action === "import_class_archive" && body.expected_kind === "learner"
    || action === "download_class_archive" && Boolean(query?.get("archive_ids"))
    || action === "purge_class_archives";
  if(COORDINATOR_ACTIONS.has(action)&&!coordinator&&!teacherLearnerArchive)coordinatorOnly();
  if (action === "get_classes") { const catalog=await classCatalog(teacherId,true); return {...catalog,archives:(catalog.archives||[]).filter(item=>item.kind==="learner")}; }
  if (["save_school_year", "edit_school_year"].includes(action)) {
    const startYear = Number(body.start_year),
      label = schoolYearLabel(startYear),
      id = operationId(body.id);
    let canonicalId = id;
    await prisma.$transaction(async tx => {
      await assertRosterVersion(tx, teacherId, body.roster_version);
      const existing = await tx.schoolYear.findUnique({
        where: {
          id
        }
      });
      if (action === "edit_school_year") {
        const year = await lockedYear(tx, teacherId, id);
        if (year.deletedAt || year.archivedAt) throw workspaceError("This school year cannot be edited.", 409);
        const duplicate = await tx.schoolYear.findFirst({
          where: {
            teacherId,
            startYear,
            deletedAt: null
          }
        });
        if (duplicate && duplicate.id !== id) throw workspaceError("This school year already exists.", 409);
        try {
          await tx.schoolYear.update({
            where: {
              id
            },
            data: {
              startYear,
              label
            }
          });
        } catch (error) {
          if (!error.code) error.code = "YEAR_UPDATE_FAILED";
          throw error;
        }
      } else {
        if (existing && (existing.teacherId !== teacherId || existing.startYear !== startYear || existing.deletedAt)) throw workspaceError("This school year cannot be recreated with an obsolete identifier.", 409);
        const duplicate = await tx.schoolYear.findFirst({
          where: {
            teacherId,
            startYear,
            deletedAt: null
          }
        });
        if (duplicate && duplicate.id!==id)throw workspaceError("This school year already exists.",409);
        if (!duplicate) await tx.schoolYear.create({
          data: {
            id,
            teacherId,
            startYear,
            label
          }
        });
      }
    });
    return {
      ...(await classCatalog(teacherId)),
      year_alias: canonicalId !== id ? {
        from: id,
        to: canonicalId
      } : null
    };
  }
  if (action === "save_class_section") {
    const id = operationId(body.id),
      schoolYearId = operationId(body.school_year_id),
      name = sectionName(body.name);
    await prisma.$transaction(async tx => {
      const year = await lockedYear(tx, teacherId, schoolYearId);
      if (year.deletedAt || year.archivedAt) throw workspaceError("Choose an active school year.", 409);
      const current = await tx.classSection.findUnique({
        where: {
          id
        }
      });
      const duplicate=await tx.classSection.findFirst({where:{teacherId,schoolYearId,nameKey:name.toLowerCase(),deletedAt:null,id:{not:id}}});
      if(duplicate)throw workspaceError("This section already exists in this school year.",409);
      if (current) {
        const section = await lockClass(tx, teacherId, id);
        if (section.schoolYearId !== schoolYearId) throw workspaceError("A section cannot be moved to a different school year.", 409);
        await tx.classSection.update({
          where: {
            id
          },
          data: {
            name,
            nameKey: name.toLowerCase()
          }
        });
        await tx.learner.updateMany({
          where: {
            teacherId,
            classSectionId: id
          },
          data: {
            section: name
          }
        });
      } else await tx.classSection.create({
        data: {
          id,
          teacherId,
          schoolYearId,
          name,
          nameKey: name.toLowerCase()
        }
      });
    });
    return classCatalog(teacherId);
  }
  if (["archive_class", "archive_school_year", "delete_class_section", "delete_school_year"].includes(action)) {
    let passwordVerified=false;
    if(action.startsWith("delete_") && body.empty_confirmation !== true) {
      await requireDeletionPassword(prisma,actor?.id||teacherId,body.confirmation_password);
      passwordVerified=true;
    }
    const op = operationId(body.id),
      isYear = action.endsWith("school_year");
    await prisma.$transaction(async tx => {
      await assertRosterVersion(tx, teacherId, body.roster_version);
      const target = isYear ? await lockedYear(tx, teacherId, body.school_year_id) : await tx.classSection.findFirst({
        where: {
          id: operationId(body.class_section_id),
          teacherId
        },
        include: {
          schoolYear: true
        }
      });
      if (!target) throw workspaceError("This section is unavailable for your account.", 404);
      if (target.deletedAt) return; // A lost acknowledgement must not create another archive.
      if (!isYear && target.schoolYear.deletedAt) throw workspaceError("This school year was deleted.", 409);
      const rows = isYear ? await tx.classSection.findMany({
        where: {
          teacherId,
          schoolYearId: target.id,
          deletedAt: null
        },
        orderBy: {
          id: "asc"
        }
      }) : [target];
      // Serialize with enrollment and section creation before deciding whether
      // the lightweight empty-container confirmation is sufficient.
      const lockedSection = !isYear ? await lockClass(tx, teacherId, target.id, false) : null;
      const hasContents = isYear ? rows.length > 0 : await tx.learner.count({where: {teacherId, classSectionId: target.id}}) > 0;
      validateLifecycle(action, target, body, hasContents, passwordVerified, coordinator);
      const sectionBackups = [];
      const retention=action.startsWith("delete_")?deletionArchiveDates():null;
      for (const row of rows) {
        const section = lockedSection || await lockClass(tx, teacherId, row.id, false);
        if (!action.startsWith("delete_") || hasContents) {
          const saved = await archiveSection(tx, teacherId, section, isYear || action === "delete_class_section" ? sectionArchiveId(op, section.id) : op, body.roster_version, retention);
          sectionBackups.push({archiveId:saved.id,name:section.name,learnerCount:saved.learnerCount});
        }
        if (action.startsWith("delete_")) {
          await tx.hostSession.deleteMany({
            where: {
              teacherId,
              learner: {
                classSectionId: section.id
              }
            }
          });
          await tx.learner.deleteMany({
            where: {
              teacherId,
              classSectionId: section.id
            }
          });
          await tx.classSection.update({
            where: {
              id: section.id
            },
            data: {
              deletedAt: new Date()
            }
          });
        }
      }
      // Keep a distinct year bundle as well as independently usable section backups.
      // Creation and the read-only/deletion transition share the same transaction.
      if (isYear && (!action.startsWith("delete_") || hasContents)) {
        const existing = await tx.classArchive.findFirst({where: {teacherId, sourceSchoolYearId: target.id, kind: "school_year",purgedAt:null}});
        if (!existing) {
          const id = sectionArchiveId(`year:${op}`, target.id);
          const snapshot = {kind: "school_year_archive", version: 1, archiveId: id, teacherId,
            rosterVersion: Number(body.roster_version ?? 0), schoolYear: target.label,
            createdAt: new Date().toISOString(), memberReferences:true};
          const sealed = sealPrivateData(snapshot);
          if (sealed.length > 3 * 1024 * 1024) throw workspaceError("This school year is too large for one backup. Archive its sections separately. No records have been removed.", 413);
          await tx.classArchive.create({data: {id, teacherId, sourceSectionId: null, sourceSchoolYearId: target.id,
            kind: "school_year", schoolYearLabel: target.label, sectionName: "", sectionCount: sectionBackups.length,
            learnerCount: sectionBackups.reduce((n, item) => n + item.learnerCount, 0), memberArchiveIds:sectionBackups.map(item=>item.archiveId), ...(retention||{}), encryptedSnapshot: sealed}});
          await writeAudit(tx, {actorId: actor?.id||teacherId, event: "school_year.archived", count: sectionBackups.length, detail: {schoolYearId: target.id, archiveId: id}});
        } else if(retention&&!existing.expiresAt)await tx.classArchive.update({where:{id:existing.id},data:retention});
      }
      if (isYear) await tx.schoolYear.update({
        where: {
          id: target.id
        },
        data: {
          archivedAt: target.archivedAt || new Date(),
          ...(action.startsWith("delete_") ? {
            deletedAt: new Date()
          } : {})
        }
      });
      if (action.startsWith("delete_")) await writeAudit(tx, {
        actorId: actor?.id||teacherId,
        event: isYear ? "school_year.deleted" : "class.deleted",
        count: rows.length,
        detail: {
          id: target.id,
          reason: String(body.deletion_reason || "").trim() || null,
          empty: !hasContents
        }
      });
    }, {
      timeout: 60000
    });
    return classCatalog(teacherId);
  }
  if(action === "purge_class_archives"){
    const ids=body.archive_ids;
    if(!Array.isArray(ids)||!ids.length||ids.length>500||new Set(ids).size!==ids.length||ids.some(id=>!UUID_PATTERN.test(String(id))))throw workspaceError("Choose 1 to 500 different archives.");
    await requireDeletionPassword(prisma,actor?.id||teacherId,body.confirmation_password);
    await prisma.$transaction(async tx=>{
      await assertRosterVersion(tx,teacherId,body.roster_version);
      const selected=[];
      for(const id of ids){const item=await tx.classArchive.findFirst({where:{id,teacherId}});if(!item)throw workspaceError("Choose your own archives.",403);selected.push(item);}
      if(!coordinator && selected.some(item=>item.kind!=="learner"))throw workspaceError("Teachers can manage only learner archives.",403);
      const allIds=[...new Set([...ids,...selected.filter(item=>item.kind==="school_year").flatMap(item=>item.memberArchiveIds||[])])];
      const rows=[];
      for(const id of allIds.sort()){
        await tx.$queryRaw`SELECT id FROM public.class_archives WHERE id=${id}::uuid AND teacher_id=${teacherId} FOR UPDATE`;
        const row=await tx.classArchive.findFirst({where:{id,teacherId}});
        if(!row)throw workspaceError("Choose your own archives.",403);
        if(!row.expiresAt)throw workspaceError("This action is only for archives created by deletion.",409);
        rows.push(row);
      }
      for(const row of rows){if(row.purgedAt)continue;
        await tx.classArchive.update({where:{id:row.id},data:{purgedAt:new Date(),encryptedSnapshot:"",learnerName:row.kind==="learner"?"":null,sectionName:"",schoolYearLabel:""}});
        await tx.adminRecoveryItem.deleteMany({where:{id:row.id,teacherId}});
      }
      await writeAudit(tx,{actorId:actor?.id||teacherId,teacherId,event:"archives.permanently_deleted",count:rows.length,detail:{archiveIds:ids}});
    },{timeout:60000});
    return classCatalog(teacherId);
  }
  if(action === "restore_class_archive"){
    const id=operationId(body.archive_id),archive=await prisma.classArchive.findFirst({where:{id,teacherId}});
    if(!archive||archive.kind==="learner"||!archiveAvailable(archive))throw workspaceError("This archive expired or is unavailable.",410);
    const backup={format:"crl-class-archive",version:1,sealed:await exportArchive(prisma,teacherId,archive)};
    return handleClassAction("import_class_archive",teacherId,{...body,backup,expected_kind:archive.kind},null,actor);
  }
  if (action === "restore_learner_archives") {
    const ids = body.archive_ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 500 || new Set(ids).size !== ids.length || ids.some(id=>!UUID_PATTERN.test(String(id)))) throw workspaceError("Select 1 to 500 different learner archives.");
    const result = await prisma.$transaction(tx=>restoreLearnerArchives(tx,teacherId,ids,body.class_section_id,body.roster_version),{timeout:60000});
    return {...await classCatalog(teacherId),...result};
  }
  if(action==="view_learner_archives" || action==="download_class_archive" && query?.get("archive_ids")){
    const ids=String(query?.get("archive_ids")||"").split(",");
    const items=await readDeletedLearnerArchives(prisma,teacherId,ids);
    if(action==="view_learner_archives")return {learners:items.flatMap(item=>item.snapshot.learners.map(learner=>({...learner,archive_id:item.archive.id}))),schoolYear:items[0].snapshot.schoolYear,sectionName:items[0].snapshot.section};
    const sealed=sealPrivateData({kind:"learner_backup",version:1,teacherId,archives:items.map(item=>item.snapshot)});
    return {backup:{format:"crl-learner-backup",version:1,sealed},filename:`CRL_Deleted_Learners_${items.length}.crl.json`};
  }
  if (action === "download_class_archive") {
    const id = String(query?.get("archive_id") || body.archive_id || "");
    if (!UUID_PATTERN.test(id)) throw workspaceError("Choose a valid archive.");
    const archive = await prisma.classArchive.findFirst({
      where: {
        id,
        teacherId
      }
    });
    if(!archive)throw workspaceError("Archive not found.",404);
    if(!archiveAvailable(archive))throw workspaceError("This archive expired or was permanently deleted.",410);
    return {
      status: "ok",
      backup: {
        format: "crl-class-archive",
        version: 1,
        sealed: await exportArchive(prisma,teacherId,archive)
      },
      filename: `CRL_${archive.kind === "school_year" ? "School_Year_" : archive.kind === "learner" ? "Learner_" : ""}${archive.schoolYearLabel}_${(archive.kind === "learner" ? archive.learnerName || "Learner" : archive.sectionName).replace(/[^a-z0-9_-]/gi, "_")}_${archive.id.slice(0,8)}.crl.json`
    };
  }
  if (action === "import_class_archive") {
    const backup = body.backup;
    if(backup?.format==="crl-learner-backup" || body.expected_kind==="learner" && backup?.format==="crl-class-archive"){
      if(body.expected_kind&&body.expected_kind!=="learner")throw workspaceError("Choose a learner backup for this import.");
      const result=await prisma.$transaction(tx=>importDeletedLearnerBackup(tx,teacherId,backup,body.class_section_id,body.roster_version),{timeout:60000});
      return {...await classCatalog(teacherId),...result};
    }

    if (backup?.format !== "crl-class-archive" || backup.version !== 1 || typeof backup.sealed !== "string" || backup.sealed.length > 18 * 1024 * 1024) throw workspaceError("Choose a valid CRL section archive.");
    let snapshot;
    try {
      snapshot = openPrivateData(backup.sealed);
    } catch {
      throw workspaceError("The archive is damaged, changed, or belongs to a different system.");
    }
    const archiveKind = snapshot.kind === "school_year_archive" ? "school_year" : snapshot.archiveKind === "learner" ? "learner" : "section";
    if (body.expected_kind && body.expected_kind !== archiveKind) throw workspaceError(`Choose a ${body.expected_kind === "school_year" ? "school-year" : body.expected_kind} backup for this import.`);
    if (archiveKind === "learner") {
      const result=await prisma.$transaction(tx=>importDeletedLearnerBackup(tx,teacherId,backup,body.class_section_id,body.roster_version),{timeout:60000});
      return {...await classCatalog(teacherId),...result};
    }

    if (snapshot.kind === "school_year_archive") {
      if(!coordinator)coordinatorOnly();
      if (snapshot.version !== 1 || snapshot.teacherId !== teacherId || !UUID_PATTERN.test(snapshot.archiveId || "")) throw workspaceError("Only this teacher's own school-year archives can be imported.", 403);
      if (!Array.isArray(snapshot.sections) || snapshot.sections.length > 500) throw workspaceError("Invalid school-year archive.");
      const sections = snapshot.sections.map(item => {
        let content;
        try { content = openPrivateData(item.sealed); } catch { throw workspaceError("A section backup is damaged or changed."); }
        if (content.kind !== "class_archive" || content.version !== 1 || content.teacherId !== teacherId || Number(content.rosterVersion ?? 0) !== Number(snapshot.rosterVersion ?? 0) || !UUID_PATTERN.test(content.archiveId || "") || !Array.isArray(content.learners) || content.learners.length > 500) throw workspaceError("Invalid section in the school-year archive.");
        return {name: sectionName(item.name), content};
      });
      if (new Set(sections.map(item => item.name.toLowerCase())).size !== sections.length) throw workspaceError("Duplicate sections in the school-year archive.");
      await prisma.$transaction(async tx => {
        await assertRosterVersion(tx, teacherId, body.roster_version);
        await assertStoredRestore(tx,teacherId,{...body,restore_member_ids:sections.map(item=>item.content.archiveId)});
        if (Number(snapshot.rosterVersion ?? 0) !== Number(body.roster_version ?? 0)) throw workspaceError("This archive predates a permanent account roster reset and cannot be restored.", 409);
        const year = await importYear(tx, teacherId, snapshot.schoolYear, body.school_year_id);
        if (year.deletedAt || year.archivedAt) throw workspaceError("Choose an active school year.", 409);
        if (year.restoredArchiveId === snapshot.archiveId) return;
        if (await tx.classSection.count({where: {teacherId, schoolYearId: year.id, deletedAt: null}})) throw workspaceError("Import a school-year backup into an empty school year. Existing sections will not be overwritten.", 409);
        for (const item of sections) {
          const section = await tx.classSection.create({data: {id: crypto.randomUUID(), teacherId, schoolYearId: year.id, name: item.name, nameKey: item.name.toLowerCase(), restoredArchiveId: item.content.archiveId}});
          await restoreSectionLearners(tx, teacherId, section, item.content);
        }
        await tx.schoolYear.update({where: {id: year.id}, data: {restoredArchiveId: snapshot.archiveId}});
        await writeAudit(tx, {actorId: actor?.id||teacherId, event: "school_year.imported", count: sections.length, detail: {schoolYearId: year.id, archiveId: snapshot.archiveId}});
      }, {timeout: 60000});
      return {...await classCatalog(teacherId), imported_count: sections.reduce((n, item) => n + item.content.learners.length, 0)};
    }
    if (snapshot.kind !== "class_archive" || snapshot.version !== 1 || snapshot.teacherId !== teacherId || !UUID_PATTERN.test(snapshot.archiveId || "")) throw workspaceError("Only this teacher's own class archives can be imported.", 403);
    if (!Array.isArray(snapshot.learners) || snapshot.learners.length > 500) throw workspaceError("The archive must contain 0 to 500 learners.");
    await prisma.$transaction(async tx => {
      await assertRosterVersion(tx, teacherId, body.roster_version);
      await assertStoredRestore(tx,teacherId,body);
      const owner = await tx.user.findUnique({
        where: {
          id: teacherId
        },
        select: {
          learnerDataVersion: true
        }
      });
      if (Number(snapshot.rosterVersion ?? 0) !== owner.learnerDataVersion) throw workspaceError("This archive predates a permanent account roster reset and cannot be restored.", 409);
      let section;
      if (body.class_section_id) section = await lockClass(tx, teacherId, body.class_section_id);
      else {
        if(!coordinator)throw workspaceError("Choose an existing section created by the Reading Coordinator to restore this archive.",403);
        const year = await lockedYear(tx,teacherId,body.school_year_id);
        if (year.archivedAt || year.deletedAt) throw workspaceError("Choose an active school year.",409);
        const name = sectionName(snapshot.section);
        const existing = await tx.classSection.findFirst({where:{teacherId,schoolYearId:year.id,nameKey:name.toLowerCase(),deletedAt:null}});
        section = existing ? await lockClass(tx,teacherId,existing.id) : await tx.classSection.create({data:{id:crypto.randomUUID(),teacherId,schoolYearId:year.id,name,nameKey:name.toLowerCase()}});
      }
      if (section.restoredArchiveId === snapshot.archiveId) return;
      if (await tx.learner.count({
        where: {
          classSectionId: section.id,
          teacherId
        }
      })) throw workspaceError("Import into an empty section. Existing records will not be overwritten.", 409);
      await restoreSectionLearners(tx, teacherId, section, snapshot);
      await tx.classSection.update({
        where: {
          id: section.id
        },
        data: {
          restoredArchiveId: snapshot.archiveId
        }
      });
      await writeAudit(tx, {
        actorId: actor?.id||teacherId,
        event: "class.imported",
        count: snapshot.learners.length,
        detail: {
          classSectionId: section.id,
          archiveId: snapshot.archiveId
        }
      });
    }, {
      timeout: 60000
    });
    return {
      status: "ok",
      imported_count: snapshot.learners.length,
      ...(await classCatalog(teacherId))
    };
  }
  throw workspaceError("Unknown class action.");
}

// One global operation archives every affected teacher class or rolls all of it back.
export async function deleteSharedSchoolYear(body,actor){
 if(!['admin','reading_coordinator'].includes(actor?.role))coordinatorOnly();const startYear=Number(body.start_year);schoolYearLabel(startYear);const op=operationId(body.id);
 const count=await prisma.schoolYearSectionInsertion.count({where:{startYear,removedAt:null,globalSchoolYear:{deletedAt:null}}});
 let approval=null;if(count){approval=await requireDeletionPassword(prisma,actor.id,body.confirmation_password);optionalDeletionReason(body);}else if(body.empty_confirmation!==true)throw workspaceError('Confirm deletion of this empty school year.');
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(177631,3)::text AS locked`;
  const definition=await tx.globalSchoolYear.findUnique({where:{startYear}});if(!definition||definition.deletedAt)return {status:'ok',already_deleted:true};
  const years=await tx.schoolYear.findMany({where:{startYear,deletedAt:null},orderBy:[{teacherId:'asc'},{id:'asc'}]});
  const owners=new Map();for(const id of [...new Set(years.map(y=>y.teacherId))].sort((a,b)=>a-b)){await tx.$queryRaw`SELECT id FROM public.users WHERE id=${id} FOR UPDATE`;owners.set(id,await tx.user.findUnique({where:{id},select:{learnerDataVersion:true}}));}
  for(const y of years)await lockedYear(tx,y.teacherId,y.id);
  const sections=await tx.classSection.findMany({where:{deletedAt:null,schoolYearId:{in:years.map(y=>y.id)}},orderBy:{id:'asc'}});
  const insertions=await tx.schoolYearSectionInsertion.findMany({where:{startYear,removedAt:null},select:{id:true}});
  if(insertions.length!==Number(body.expected_sections??count))throw workspaceError('Sections changed. Refresh the school-year list and confirm again.',409);
  if(insertions.length&&!approval)throw workspaceError('This school year now contains sections. Confirm your password before deleting.',409);
  if(approval){const admin=await tx.user.findFirst({where:{id:actor.id,role:{in:['admin','reading_coordinator']}}});if(!admin||admin.passwordHash!==approval.passwordHash||admin.loginLockedUntil&&admin.loginLockedUntil>new Date())throw workspaceError('Your authorization changed. Sign in and confirm again.',403);}
  const now=new Date(),retention=deletionArchiveDates(now.getTime());
  for(const year of years){const members=[];for(const row of sections.filter(s=>s.schoolYearId===year.id)){const section=await lockClass(tx,year.teacherId,row.id,false,true),saved=await archiveSection(tx,year.teacherId,section,sectionArchiveId(op,section.id),owners.get(year.teacherId).learnerDataVersion,retention);members.push(saved);await tx.hostSession.deleteMany({where:{teacherId:year.teacherId,learner:{classSectionId:section.id}}});await tx.learner.deleteMany({where:{teacherId:year.teacherId,classSectionId:section.id}});await tx.classSection.update({where:{id:section.id},data:{deletedAt:now}});}
   if(members.length){const id=sectionArchiveId('global-year:'+op,year.id),snapshot={kind:'school_year_archive',version:1,archiveId:id,teacherId:year.teacherId,rosterVersion:owners.get(year.teacherId).learnerDataVersion,schoolYear:year.label,createdAt:now.toISOString(),memberReferences:true};const prior=await tx.classArchive.findFirst({where:{teacherId:year.teacherId,sourceSchoolYearId:year.id,kind:'school_year',purgedAt:null}});if(prior){await tx.classArchive.update({where:{id:prior.id},data:{...(!prior.expiresAt?retention:{}),memberArchiveIds:members.map(s=>s.id),sectionCount:members.length,learnerCount:members.reduce((n,s)=>n+s.learnerCount,0)}});}else await tx.classArchive.create({data:{id,teacherId:year.teacherId,sourceSchoolYearId:year.id,kind:'school_year',schoolYearLabel:year.label,sectionName:'',sectionCount:members.length,learnerCount:members.reduce((n,s)=>n+s.learnerCount,0),memberArchiveIds:members.map(s=>s.id),...retention,encryptedSnapshot:sealPrivateData(snapshot)}});}
   await tx.schoolYear.update({where:{id:year.id},data:{archivedAt:year.archivedAt||now,deletedAt:now}});
  }
  await tx.globalSchoolYear.update({where:{startYear},data:{deletedAt:now}});await writeAudit(tx,{actorId:actor.id,event:'school_year.deleted_globally',count:insertions.length,detail:{startYear,teacherCount:years.length,reason:String(body.deletion_reason||'').trim()||null}});return {status:'ok'};
 },{timeout:120000,isolationLevel:'Serializable'});
}
