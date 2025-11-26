import Joi from "joi";

export const authValidators = {
  register: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    firstName: Joi.string().optional(),
    lastName: Joi.string().optional(),
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  }),
};

export const uploadValidators = {
  presignedUrl: Joi.object({
    fileName: Joi.string().required(),
    fileSize: Joi.number()
      .max(10 * 1024 * 1024)
      .required(),
    contentType: Joi.string().valid("application/pdf").required(),
  }),
};

export const jobValidators = {
  getJob: Joi.object({
    jobId: Joi.string().uuid().required(),
  }),

  listJobs: Joi.object({
    limit: Joi.number().min(1).max(100).default(10),
    offset: Joi.number().min(0).default(0),
  }),
};
