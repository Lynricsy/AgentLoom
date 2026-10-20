/** 生成运行队列（ADR-0007 §5）：每个 job 跑一次 Gate 0–7，jobId 即 generation run id */
export const GENERATED_APP_GENERATION_QUEUE = 'generated-app-generation';
export const GENERATED_APP_GENERATION_JOB_NAME = 'run-generated-app-generation';

/** 失败不自动重投：一次运行会调用模型并真实执行绑定的工作流，重投会重复计费 */
export const generatedAppGenerationJobOptions = {
  attempts: 1,
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 1000 },
};

export interface GeneratedAppGenerationJobData {
  tenantId: string;
  userId: string;
  appId: string;
  generationRunId: string;
  /** start 请求的 regenerateAppSpec 或 triggerSource=retry */
  regenerateAppSpec: boolean;
}
