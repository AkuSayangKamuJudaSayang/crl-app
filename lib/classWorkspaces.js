import crypto from "node:crypto";
import { prisma } from "./prisma";
import { learnerHistoryInclude, sealPrivateData, openPrivateData, writeAudit } from "./adminHistory";
import { UUID_PATTERN, schoolYearLabel, sectionName, workspaceError, classLifecyclePhrase } from "./classWorkspace.mjs";
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
  if (!section || section.deletedAt || section.schoolYear.deletedAt) throw workspaceError("This class is unavailable for your account.", 404);
  if (writable && (section.archivedAt || section.schoolYear.archivedAt)) throw workspaceError("This section is archived. Choose an active section to make changes.", 409);
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
  const [years, classes, archives, owner] = await Promise.all([prisma.schoolYear.findMany({
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
  return {
    status: "ok",
    schoolYears: years.filter(x => !x.deletedAt),
    sections: classes.filter(x => !x.deletedAt),
    deletedYearIds: years.filter(x => x.deletedAt).map(x => x.id),
    deletedSectionIds: classes.filter(x => x.deletedAt).map(x => x.id),
    archives,
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
    where: {
      id,
      teacherId
    }
  });
  if (!year) throw workspaceError("This school year is unavailable for your account.", 404);
  return year;
}
function sectionArchiveId(operation, sectionId) {
  const chars = crypto.createHash("sha256").update(`crl-section-archive:${operation}:${sectionId}`).digest("hex").slice(0, 32).split("");
  chars[12] = "8";
  chars[16] = "8";
  const v = chars.join("");
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20)}`;
}
async function archiveSection(tx, teacherId, section, id, version) {
  const existing = await tx.classArchive.findUnique({
    where: {
      id
    }
  });
  if (existing) {
    if (existing.teacherId !== teacherId || existing.sourceSectionId !== section.id) throw workspaceError("Archive identifier is already in use.", 409);
    return;
  }
  if (section.archivedAt && (await tx.classArchive.findFirst({
    where: {
      teacherId,
      sourceSectionId: section.id
    }
  }))) return;
  const live = await tx.hostSession.count({
    where: {
      teacherId,
      learner: {
        classSectionId: section.id
      },
      ended: false
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
  await tx.classArchive.create({
    data: {
      id,
      teacherId,
      sourceSectionId: section.id,
      schoolYearLabel: section.schoolYear.label,
      sectionName: section.name,
      learnerCount: learners.length,
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
}
function validateLifecycle(action, target, body) {
  const phrase = classLifecyclePhrase(action, target);
  if (body.confirmation !== phrase || body.completed_ack !== true) throw workspaceError(`Confirm all devices are synchronized and type ${phrase} exactly.`);
  if (action.startsWith("delete_") && (typeof body.deletion_reason !== "string" || body.deletion_reason.trim().length < 5 || body.deletion_reason.trim().length > 300)) throw workspaceError("Provide a deletion reason of 5 to 300 characters.");
}
export async function handleClassAction(action, teacherId, body = {}, query = null) {
  if (action === "get_classes") return classCatalog(teacherId);
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
        if (duplicate) canonicalId = duplicate.id;else await tx.schoolYear.create({
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
      validateLifecycle(action, target, body);
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
      if (action === "archive_school_year" && !rows.length) throw workspaceError("Add a section before archiving this school year.");
      for (const row of rows) {
        const section = await lockClass(tx, teacherId, row.id, false);
        await archiveSection(tx, teacherId, section, isYear || action === "delete_class_section" ? sectionArchiveId(op, section.id) : op, body.roster_version);
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
        actorId: teacherId,
        event: isYear ? "school_year.deleted" : "class.deleted",
        count: rows.length,
        detail: {
          id: target.id,
          reason: body.deletion_reason.trim()
        }
      });
    }, {
      timeout: 60000
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
    if (!Array.isArray(snapshot.learners) || snapshot.learners.length > 500) throw workspaceError("The archive must contain 0 to 500 learners.");
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
