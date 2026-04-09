import cloudinary from '../config/cloudinary';
import { UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';

export const uploadToCloudinary = (
  file: Express.Multer.File
): Promise<UploadApiResponse> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'drivers',
        transformation: [
          { width: 500, height: 500, crop: 'limit' },
          { quality: 'auto' },
          { format: 'auto' }
        ]
      },
      (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
        if (error) {
          reject(error);
        } else if (result) {
          resolve(result);
        } else {
          reject(new Error('Unknown error occurred during upload'));
        }
      }
    );

    uploadStream.end(file.buffer);
  });
};

export const uploadFileToCloudinary = (
  file: Express.Multer.File,
  folder: string,
): Promise<UploadApiResponse> => {
  const isImage = file.mimetype.startsWith('image/');

  return new Promise((resolve, reject) => {
    const options: Record<string, any> = {
      folder,
      resource_type: isImage ? 'image' : 'raw',
    };

    if (isImage) {
      options.transformation = [
        { width: 1200, height: 1200, crop: 'limit' },
        { quality: 'auto' },
        { format: 'auto' },
      ];
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      options,
      (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
        if (error) {
          reject(error);
        } else if (result) {
          resolve(result);
        } else {
          reject(new Error('Unknown error occurred during upload'));
        }
      },
    );

    uploadStream.end(file.buffer);
  });
};

export const deleteFromCloudinary = async (publicId: string): Promise<void> => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Error deleting image from Cloudinary:', error);
    throw error;
  }
};