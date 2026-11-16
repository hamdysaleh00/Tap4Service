import {readJsonBody} from './request-validation.mjs';
export const readAuthBody=request=>readJsonBody(request,8192);
