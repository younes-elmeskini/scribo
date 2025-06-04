# ----------------------------
# Stage 1: Base
# ----------------------------
    FROM node:20-alpine AS base

    RUN apk add --no-cache libc6-compat openssl
    
    WORKDIR /app
    
    COPY package*.json ./
    
    # ----------------------------
    # Stage 2: Builder
    # ----------------------------
    FROM base AS builder
    
    # Install all dependencies (including dev)
    RUN npm install
    
    # Copy source code (including prisma)
    COPY . .
    
    # Generate Prisma client (make sure prisma/schema.prisma exists)
    RUN npx prisma generate
    
    # Compile TypeScript to JavaScript (must output to dist)
    RUN npm run build
    
    # ----------------------------
    # Stage 3: Runtime
    # ----------------------------
    FROM base AS runtime
    
    # Install only production deps
    RUN npm install --production
    
    # Copy build and deps
    COPY --from=builder /app/dist ./dist
    COPY --from=builder /app/node_modules ./node_modules
    COPY --from=builder /app/package.json ./package.json
    
    # Use a non-root user
    RUN addgroup -S nodejs && adduser -S -G nodejs nodejs
    USER nodejs
    
    ENV NODE_ENV=production
    ENV PORT=4000
    
    EXPOSE 4000
    
    CMD ["node", "dist/src/server.js"]