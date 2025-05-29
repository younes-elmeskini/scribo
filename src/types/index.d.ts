import { ClientJwtPayload } from '../modules/client/middleware/auth';

declare global {
  namespace Express {
    interface Request {
      client?: ClientJwtPayload;
      file?: {
        fieldname: string;
        originalname: string;
        encoding: string;
        mimetype: string;
        size: number;
        buffer: Buffer;
      };
    }
  }
}