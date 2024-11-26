import { CustomError } from './CustomError.js';
import { PLATFORMS } from '../config/constants.js';

export const validateUrl = (url) => {
  if (!url) {
    throw new CustomError('URL is required', 400);
  }
  try {
    new URL(url);
    return true;
  } catch (err) {
    throw new CustomError('Invalid URL format', 400);
  }
};

export const validatePlatform = (platform) => {
  if (!platform || !Object.values(PLATFORMS).includes(platform)) {
    throw new CustomError(`Invalid platform. Must be one of: ${Object.values(PLATFORMS).join(', ')}`, 400);
  }
  return true;
};
