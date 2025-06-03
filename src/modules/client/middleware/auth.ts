import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Client } from "@prisma/client";
import prisma from "../../../utils/client";

export interface ClientJwtPayload {
  id: String;
}
export const generateToken = (client: Client) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET must be defined");
  }
  const token = jwt.sign(
    {
      id: client.id,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );
  return token;
};

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

  if (!token) {
    res.status(401).json({ message: "Access denied. No token provided." });
    return;
  }

  try {
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET must be defined");
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    ) as ClientJwtPayload;
    req.client = decoded;
    
    const client = await prisma.client.findFirst({
      where: { id: req.client.id.toString() },
    })
    console.log(client);
    
    if (!client?.id) {
      res.status(401).json({ message: "Access denied. Invalid token." });
      return;
    }
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid token." });
  }
};
