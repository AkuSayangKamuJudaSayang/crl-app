import crypto from "node:crypto";
import { prisma } from "./prisma";
import { learnerHistoryInclude, sealPrivateData, openPrivateData, writeAudit } from "./adminHistory";
import { UUID_PATTERN, schoolYearLabel, sectionName, workspaceError } from "./classWorkspace.mjs";
export async function requireClass(db, teacherId, id, writable = false) {
  if (!UUID_PATTERN.test(String(id || ""))) throw workspaceError("Choose a school year and section first.");
  const section = await db.classSection.findFirst({
    where: {
      id,
      teacherId
    },
    include: {
      schoolYear: true
    }
  });
  if (!section) throw workspaceError("This class is unavailable for your account.", 404);
  if (writable && section.archivedAt) throw workspaceError("This section is archived. Choose an active section to make changes.", 409);
  return section;
}
export async function lockClass(tx, teacherId, id, writable = true) {
  if (!UUID_PATTERN.test(String(id || ""))) throw workspaceError("Choose a school year and section first.");
  await tx.$queryRaw`SELECT id FROM public.class_sections WHERE id=${id}::uuid AND teacher_id=${teacherId} FOR UPDATE`;
  return requireClass(tx, teacherId, id, writable);
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
const archiveSelect = {
  id: true,
  schoolYearLabel: true,
  sectionName: true,
  learnerCount: true,
  createdAt: true,
  sourceSectionId: true
};
export async function classCatalog(teacherId) {
  const [schoolYears, sections, archives, owner] = await Promise.all([prisma.schoolYear.findMany({
    where: {
      teacherId
    },
    orderBy: {
      startYear: "desc"
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
  return {
    status: "ok",
    schoolYears,
    sections,
    archives,
    roster_version: owner?.learnerDataVersion ?? 0
  };
}
function pick(row, fields) {
  return Object.fromEntries(fields.filter(k => row[k] !== undefined).map(k => [k, row[k]]));
}
export async function handleClassAction(action, teacherId, body = {}, query = null) {
  if (action === "get_classes") return classCatalog(teacherId);
  if (action === "save_school_year") {
    const startYear = Number(body.start_year),
      label = schoolYearLabel(startYear);
    const id = String(body.id || "");
    if (!UUID_PATTERN.test(id)) throw workspaceError("A valid school-year identifier is required.");
    await prisma.$transaction(async tx => {
      const existing = await tx.schoolYear.findUnique({
        where: {
          id
        }
      });
      if (existing && (existing.teacherId !== teacherId || existing.startYear !== startYear)) throw workspaceError("This school year cannot be changed.", 409);
      await tx.schoolYear.upsert({
        where: {
          teacherId_startYear: {
            teacherId,
            startYear
          }
        },
        create: {
          id,
          teacherId,
          startYear,
          label
        },
        update: {}
      });
    });
    return classCatalog(teacherId);
  }
  if (action === "save_class_section") {
    const id = String(body.id || ""),
      schoolYearId = String(body.school_year_id || ""),
      name = sectionName(body.name);
    if (!UUID_PATTERN.test(id) || !UUID_PATTERN.test(schoolYearId)) throw workspaceError("Choose a valid school year.");
    await prisma.$transaction(async tx => {
      const year = await tx.schoolYear.findFirst({
        where: {
          id: schoolYearId,
          teacherId
        }
      });
      if (!year) throw workspaceError("This school year is unavailable for your account.", 404);
      const current = await tx.classSection.findUnique({
        where: {
          id
        }
      });
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
  if (action === "archive_class") {
    const id = String(body.id || "");
    if (!UUID_PATTERN.test(id)) throw workspaceError("A valid archive identifier is required.");
    await prisma.$transaction(async tx => {
      const existing = await tx.classArchive.findUnique({
        where: {
          id
        }
      });
      if (existing) {
        if (existing.teacherId !== teacherId || existing.sourceSectionId !== body.class_section_id) throw workspaceError("Archive identifier is already in use.", 409);
        return;
      }
      await assertRosterVersion(tx, teacherId, body.roster_version);
      const section = await lockClass(tx, teacherId, body.class_section_id);
      if (body.confirmation !== `ARCHIVE ${section.name}` || body.completed_ack !== true) throw workspaceError("Confirm this section's school-year records are complete and type the archive phrase.");
      const live = await tx.hostSession.count({
        where: {
          teacherId,
          learner: {
            classSectionId: section.id
          },
          ended: false
        }
      });
      if (live) throw workspaceError("End all assessments in this section before archiving.", 409);
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
                  storyTitle: true
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
      if (!learners.length) throw workspaceError("There are no learners to archive.");
      const snapshot = {
        kind: "class_archive",
        version: 1,
        archiveId: id,
        teacherId,
        rosterVersion: Number(body.roster_version ?? 0),
        schoolYear: section.schoolYear.label,
        section: section.name,
        createdAt: new Date().toISOString(),
        learners
      };
      await tx.classArchive.create({
        data: {
          id,
          teacherId,
          sourceSectionId: section.id,
          schoolYearLabel: section.schoolYear.label,
          sectionName: section.name,
          learnerCount: learners.length,
          encryptedSnapshot: sealPrivateData(snapshot)
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
    }, {
      timeout: 30000
    });
    return classCatalog(teacherId);
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
    if (!archive) throw workspaceError("Archive not found.", 404);
    return {
      status: "ok",
      backup: {
        format: "crl-class-archive",
        version: 1,
        sealed: archive.encryptedSnapshot
      },
      filename: `CRL_${archive.schoolYearLabel}_${archive.sectionName.replace(/[^a-z0-9_-]/gi, "_")}.crl.json`
    };
  }
  if (action === "import_class_archive") {
    const backup = body.backup;
    if (backup?.format !== "crl-class-archive" || backup.version !== 1 || typeof backup.sealed !== "string" || backup.sealed.length > 18 * 1024 * 1024) throw workspaceError("Choose a valid CRL section archive.");
    let snapshot;
    try {
      snapshot = openPrivateData(backup.sealed);
    } catch {
      throw workspaceError("The archive is damaged, changed, or belongs to a different system.");
    }
    if (snapshot.kind !== "class_archive" || snapshot.version !== 1 || snapshot.teacherId !== teacherId || !UUID_PATTERN.test(snapshot.archiveId || "")) throw workspaceError("Only this teacher's own class archives can be imported.", 403);
    if (!Array.isArray(snapshot.learners) || !snapshot.learners.length || snapshot.learners.length > 500) throw workspaceError("The archive must contain 1 to 500 learners.");
    await prisma.$transaction(async tx => {
      await assertRosterVersion(tx, teacherId, body.roster_version);
      const owner = await tx.user.findUnique({
        where: {
          id: teacherId
        },
        select: {
          learnerDataVersion: true
        }
      });
      if (Number(snapshot.rosterVersion ?? 0) !== owner.learnerDataVersion) throw workspaceError("This archive predates a permanent account roster reset and cannot be restored.", 409);
      const section = await lockClass(tx, teacherId, body.class_section_id);
      if (section.restoredArchiveId === snapshot.archiveId) return;
      if (await tx.learner.count({
        where: {
          classSectionId: section.id,
          teacherId
        }
      })) throw workspaceError("Import into an empty section. Existing records will not be overwritten.", 409);
      for (const row of snapshot.learners) {
        const learner = await tx.learner.create({
          data: {
            ...pick(row, ["lrn", "firstName", "middleName", "lastName", "suffix", "sex", "gradeLevel"]),
            teacherId,
            classSectionId: section.id,
            section: section.name
          }
        });
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
              stage: "completed",
              ended: true
            }
          });
        }
      }
      await tx.classSection.update({
        where: {
          id: section.id
        },
        data: {
          restoredArchiveId: snapshot.archiveId
        }
      });
      await writeAudit(tx, {
        actorId: teacherId,
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
