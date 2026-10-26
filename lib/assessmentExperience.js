// The host lock is shared with final review. A late replay can acknowledge a
// saved rating, but must never replay older answers/miscues over the final result.
export async function persistExperienceRating(db, teacherId, input) {
  const { code, learnerId, rating, comprehension, miscues, timerSeconds } = input;
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM public.host_sessions WHERE code=${code} AND teacher_id=${teacherId} FOR UPDATE`;
    const host = await tx.hostSession.findFirst({
      where: {code, teacherId},
      include: {assessmentSession: {include: {sessionMetrics: true}}},
    });
    if (!host?.assessmentSession || host.assessmentSession.teacherId !== teacherId) throw Object.assign(new Error("Assessment session not found."), {status:404});
    if (learnerId && Number(host.learnerId) !== learnerId) throw Object.assign(new Error("Learner does not match this assessment session."), {status:403});
    const metrics = host.assessmentSession.sessionMetrics;
    const terminal = ["teacher_review", "completed"].includes(host.stage);
    if (terminal && Number(metrics?.experienceRating) === rating) return {host, duplicate:true, metrics};
    if (terminal || host.ended || !["learner_experience", "comprehension", "passage"].includes(host.stage)) throw Object.assign(new Error("The learner experience rating conflicts with the current assessment. Refresh the assessment before trying again."), {status:409});
    await tx.comprehensionResult.deleteMany({where:{sessionId:host.assessmentSessionId, questionIndex:{in:comprehension.map(row=>row.questionIndex)}}});
    await tx.comprehensionResult.createMany({data:comprehension.map(row=>({sessionId:host.assessmentSessionId,...row}))});
    await tx.passageMiscue.deleteMany({where:{sessionId:host.assessmentSessionId}});
    if (miscues.length) await tx.passageMiscue.createMany({data:miscues.map(row=>({sessionId:host.assessmentSessionId,...row}))});
    await tx.sessionMetrics.upsert({where:{sessionId:host.assessmentSessionId},update:{timerSeconds,experienceRating:rating},create:{sessionId:host.assessmentSessionId,timerSeconds,experienceRating:rating}});
    const updated = await tx.hostSession.update({where:{id:host.id},data:{stage:"teacher_review",currentContent:"TEACHER_REVIEW",linkedAt:host.linkedAt || new Date()}});
    return {host:{...host,...updated},duplicate:false};
  }, {maxWait:10000,timeout:30000});
}
