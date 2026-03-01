import jwt from 'jsonwebtoken';
import { ITokenPayload } from '../types';

export const generateToken = (payload: ITokenPayload, expiresIn: string = '15m'): string => {
  const { exp, iat, ...rest } = payload;
  return jwt.sign(rest, process.env.JWT_SECRET as string, { expiresIn } as jwt.SignOptions);
};

export const generateRefreshToken = (payload: ITokenPayload, expiresIn: string = '7d'): string => {
  const { exp, iat, ...rest } = payload;
  return jwt.sign(rest, process.env.REFRESH_TOKEN_SECRET as string, { expiresIn } as jwt.SignOptions);
};

export const verifyToken = (token: string): ITokenPayload => {
  return jwt.verify(token, process.env.JWT_SECRET!) as ITokenPayload;
};

export const verifyRefreshToken = (token: string): ITokenPayload => {
  return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET!) as ITokenPayload;
};

export const generateResetToken = (): string => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};