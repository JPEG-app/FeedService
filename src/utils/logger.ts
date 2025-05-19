import winston from 'winston';
import { NextFunction, Request as ExpressRequest, Response } from 'express';
import addRequestId from 'express-request-id';
import { v4 as uuidv4 } from 'uuid';

export interface RequestWithId extends ExpressRequest {
  id?: string;
}

export const assignRequestId = addRequestId({
    setHeader: true,
    headerName: 'X-Correlation-ID'
});

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const consoleLogFormat = printf(({ level, message, timestamp, service, correlationId, stack, type, ...metadata }) => {
  let log = `${timestamp} [${service}] ${level}`;
  if (correlationId) {
    log += ` [correlationId: ${correlationId}]`;
  }
  if (type) {
    log += ` [type: ${type}]`;
  }
  log += `: ${message}`;
  const metaString = Object.keys(metadata).length > 0 ? ` ${JSON.stringify(metadata)}` : '';
  log += metaString;
  if (stack) {
    log += `\n${stack}`;
  }
  return log;
});

const serviceName = process.env.SERVICE_NAME || 'feed-service';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp(),
    errors({ stack: true }),
    winston.format((info) => {
      info.service = serviceName;
      return info;
    })(),
  ),
  transports: [],
  defaultMeta: { service: serviceName },
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: combine(
      colorize(),
      consoleLogFormat
    ),
  }));
} else {
  logger.add(new winston.transports.Console({
    format: combine(
        json()
    ),
  }));
}

export const requestLogger = (req: ExpressRequest, res: Response, next: NextFunction) => {
  const start = Date.now();
  const typedReq = req as RequestWithId;

  let correlationId = typedReq.id;
  if (!correlationId) {
      correlationId = req.headers['x-correlation-id']?.toString() || uuidv4();
      typedReq.id = correlationId;
  }


  const commonLogData = {
    correlationId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  };

  logger.info(`Incoming request`, { ...commonLogData, type: 'RequestLog.Start' });

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`Request finished`, {
      ...commonLogData,
      status: res.statusCode,
      durationMs: duration,
      type: 'RequestLog.Finish',
    });
  });

  res.on('error', (err) => {
    logger.error(`Error in response stream`, {
        ...commonLogData,
        error: err.message,
        stack: err.stack,
        type: 'RequestErrorLog'
    });
  });

  next();
};

export const logError = (err: any, req?: ExpressRequest, messagePrefix?: string) => {
    const typedReq = req as RequestWithId | undefined; 

    const correlationId = typedReq?.id || (err.isAxiosError && err.config?.headers?.['X-Correlation-ID']) || uuidv4();
    const logObject: any = {
        correlationId,
        error: err.message,
        stack: err.stack,
        type: 'ApplicationErrorLog',
    };
    if (req) {
        logObject.request = {
            method: req.method,
            url: req.originalUrl,
            ip: req.ip,
        };
    }
    if (err.status) logObject.status = err.status;
    if (err.code) logObject.errorCode = err.code;

    const finalMessage = messagePrefix ? `${messagePrefix}: ${err.message}` : err.message;
    logger.error(finalMessage, logObject);
};

export default logger;