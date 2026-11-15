'use client';
import {useState} from 'react';
import ClassDialog from './ClassDialog';
import {AnalyticsLearnerResultPanel} from './SharedAssessmentResults';
import {coordinatorSessionResult,coordinatorResultLearner} from '../lib/coordinatorResultView.mjs';
export default function CoordinatorIndividualResults({learner,scope,loading,error,onClose,initialPeriod}){
 const results=(learner?.assessmentSessions||[]).filter(row=>row.isCompleted);
 const [period,setPeriod]=useState(()=>initialPeriod||results.at(-1)?.assessmentPeriod||'BoSY'),[printError,setPrintError]=useState('');
 const selected=results.find(row=>row.assessmentPeriod===period)||results[0];
 const effectivePeriod=selected?.assessmentPeriod||period;
 const result=coordinatorSessionResult(selected,learner?.id);
 return <ClassDialog title="Learner results" wide showClose onClose={onClose}><div className="sharedAssessmentResults"><AnalyticsLearnerResultPanel selectedLearner={coordinatorResultLearner(learner)} selectedPeriods={['BoSY','MoSY','EoSY'].filter(value=>results.some(row=>row.assessmentPeriod===value))} period={effectivePeriod} onPeriodChange={setPeriod} loading={loading} error={error} selectedAssessment={result} detail={result} section={scope?.section} year={scope?.year} teacher={scope?.teacher} onPrintError={setPrintError}/>{printError&&<p role="alert">{printError}</p>}</div></ClassDialog>;
}
