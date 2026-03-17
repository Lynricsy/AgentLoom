export const OPTIMIZATION_ANALYSIS_QUEUE = 'optimization-analysis';
export const OPTIMIZATION_ANALYSIS_JOB_NAME = 'run-optimization-analysis';
export const OPTIMIZATION_ANALYSIS_JOB_ID = 'optimization-analysis-weekly';

export const defaultJobOptions = {
  attempts: 1,
  removeOnComplete: { count: 10 },
  removeOnFail: { count: 50 },
};
