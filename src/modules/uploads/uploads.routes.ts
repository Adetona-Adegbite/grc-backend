import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../../middleware/authenticate";
import multer from "multer";
import { upload } from "../../config/upload";

const router = Router();

router.use(authenticate);

router.post(
  "/test-evidence",
  (req: Request, res: Response, next: NextFunction) => {
    upload.single("test_evidence")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(400).json({
            data: null,
            error: "File too large. Maximum size is 10MB",
          });
          return;
        }
        res.status(400).json({ data: null, error: err.message });
        return;
      }
      if (err) {
        res.status(400).json({ data: null, error: err.message });
        return;
      }

      if (!req.file) {
        res.status(400).json({ data: null, error: "No file uploaded" });
        return;
      }

      const fileUrl = `/uploads/tests/${req.file.filename}`;

      res.status(201).json({
        data: {
          url: fileUrl,
          filename: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
        },
        error: null,
      });
    });
  }
);

router.post(
  "/issue-evidence",
  (req: Request, res: Response, next: NextFunction) => {
    upload.single("issue_evidence")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(400).json({
            data: null,
            error: "File too large. Maximum size is 10MB",
          });
          return;
        }
        res.status(400).json({ data: null, error: err.message });
        return;
      }
      if (err) {
        res.status(400).json({ data: null, error: err.message });
        return;
      }

      if (!req.file) {
        res.status(400).json({ data: null, error: "No file uploaded" });
        return;
      }

      const fileUrl = `/uploads/issues/${req.file.filename}`;

      res.status(201).json({
        data: {
          url: fileUrl,
          filename: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
        },
        error: null,
      });
    });
  }
);

export default router;
