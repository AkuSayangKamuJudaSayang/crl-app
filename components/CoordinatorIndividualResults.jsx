'use client';

import { useState } from 'react';
import ClassDialog from './ClassDialog';
import { AnalyticsLearnerResultPanel } from './SharedAssessmentResults';
import { coordinatorSessionResult, coordinatorResultLearner } from '../lib/coordinatorResultView.mjs';
import { latestLearnerPeriodResults } from '../lib/learnerPeriodResults.mjs';

export default function CoordinatorIndividualResults({ learner, scope, loading, error, onClose, initialPeriod }) {
  const [period, setPeriod] = useState(initialPeriod || 'BoSY');
  const [printError, setPrintError] = useState('');
  const results = (learner?.assessmentSessions || []).map(session => coordinatorSessionResult(session, learner.id));
  const latest = latestLearnerPeriodResults(results).get(String(learner?.id)) || {};
  const periodResults = Object.entries(latest).map(([period, result]) => ({ period, result, detail: result }));

  return (
    <ClassDialog title="Learner results" wide showClose onClose={onClose}>
      <div className="sharedAssessmentResults">
        <AnalyticsLearnerResultPanel
          selectedLearner={coordinatorResultLearner(learner)}
          periodResults={periodResults}
          period={period}
          onPeriodChange={setPeriod}
          initialSummary={!initialPeriod}
          loading={loading}
          error={error}
          section={scope?.section}
          year={scope?.year}
          teacher={scope?.teacher}
          onPrintError={setPrintError}
        />
        {printError && <p role="alert">{printError}</p>}
      </div>
    </ClassDialog>
  );
}
