import { ClientJwtPayload } from '../modules/client/middleware/auth';

declare global {
  namespace Express {
    interface Request {
      client?: ClientJwtPayload;
    }
  }
}