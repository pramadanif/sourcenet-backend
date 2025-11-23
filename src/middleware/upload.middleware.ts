import multer from 'multer';

// Configure storage
const storage = multer.memoryStorage();

// Create multer instance
export const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit matching controller
    },
});
