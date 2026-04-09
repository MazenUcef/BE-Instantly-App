import multer from 'multer';

const storage = multer.memoryStorage();

const imageFilter = (req: any, file: any, cb: any) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const ALLOWED_FILE_MIMES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const imageAndFileFilter = (req: any, file: any, cb: any) => {
  if (ALLOWED_FILE_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed. Accepted: images, PDF, Word, Excel'), false);
  }
};

const upload = multer({
  storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

export const uploadWithFiles = multer({
  storage,
  fileFilter: imageAndFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

export default upload;