import { Document } from 'mongoose';
import { ITokenPayload } from '../shared/types';

declare global {
  namespace Express {
    interface Request {
      user: ITokenPayload;
      files?: any;
      file?: any;
    }
  }
  
  interface Error {
    status?: number;
  }
}

export interface IAuthRequest extends Request {
  user: ITokenPayload;
}