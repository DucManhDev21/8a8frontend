import "dotenv/config";
import express from "express";
import cors from "cors";
import cron from "node-cron";
import admin from "firebase-admin";
import crypto from "node:crypto";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 8080);
const SUPER_ADMIN_EMAIL = String(
  process.env.SUPER_ADMIN_EMAIL || "tranducmanh2109@gmail.com"
).trim().toLowerCase();

const allowedOrigins = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Server-to-server requests and local tools do not always send Origin.
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0 || allowedOrigins.includes("*")) {
        return callback(null, true);
      }
      return callback(null, allowedOrigins.includes(origin));
    },
    credentials: true,
  })
);

function createFirebaseAdmin() {
  if (admin.apps.length) return admin.app();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  // Railway can also provide GOOGLE_APPLICATION_CREDENTIALS.
  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const firebaseApp = createFirebaseAdmin();
const db = admin.firestore();
const auth = admin.auth();

const USER_ROLES = new Set(["student", "admin", "super_admin"]);
const ADMIN_ROLES = new Set(["admin", "super_admin"]);

function asyncHandler(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function getUserProfile(uid) {
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function requireFirebaseUser(req, res, next) {
  try {
    const authorization = String(req.headers.authorization || "");
    const match = authorization.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return res.status(401).json({
        ok: false,
        error: "UNAUTHENTICATED",
        message: "Thiếu Firebase ID token.",
      });
    }

    const decoded = await auth.verifyIdToken(match[1], true);
    const profile = await getUserProfile(decoded.uid);

    if (!profile) {
      return res.status(403).json({
        ok: false,
        error: "PROFILE_NOT_FOUND",
        message: "Không tìm thấy hồ sơ người dùng trong Firestore.",
      });
    }

    const role = String(profile.role || "student");
    if (!USER_ROLES.has(role)) {
      return res.status(403).json({
        ok: false,
        error: "INVALID_ROLE",
        message: "Vai trò tài khoản không hợp lệ.",
      });
    }

    req.firebaseUser = decoded;
    req.userProfile = profile;
    next();
  } catch (error) {
    console.error("Firebase authentication error:", error);
    return res.status(401).json({
      ok: false,
      error: "INVALID_TOKEN",
      message: "Firebase ID token không hợp lệ hoặc đã hết hạn.",
    });
  }
}

function requireAdmin(req, res, next) {
  if (!ADMIN_ROLES.has(req.userProfile?.role)) {
    return res.status(403).json({
      ok: false,
      error: "ADMIN_ONLY",
      message: "Bạn không có quyền quản trị.",
    });
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  const role = req.userProfile?.role;
  const email = normalizeEmail(req.firebaseUser?.email);

  if (role !== "super_admin" || email !== SUPER_ADMIN_EMAIL) {
    return res.status(403).json({
      ok: false,
      error: "SUPER_ADMIN_ONLY",
      message: "Chỉ Super Admin được phép thực hiện thao tác này.",
    });
  }
  next();
}

function slugifyVietnamese(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

function makeStudentCredentials(name) {
  const slug = slugifyVietnamese(name) || "hoc.sinh";
  const suffix = crypto.randomBytes(3).toString("hex");
  const email = `8a8.${slug}.${suffix}@a8thcscl2.local`;
  const password = crypto.randomBytes(9).toString("base64url");
  return { email, password };
}

function nowTimestamp() {
  return admin.firestore.Timestamp.now();
}

async function resetPopupState() {
  const dayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  await db.collection("system").doc("runtime").set(
    {
      popupReadResetAt: nowTimestamp(),
      popupDayKey: dayKey,
      updatedAt: nowTimestamp(),
    },
    { merge: true }
  );

  // Optional server-side read-state collection. If it does not exist,
  // this query simply produces no documents.
  const reads = await db.collection("popupReads").get();
  if (reads.empty) return 0;

  const batch = db.batch();
  reads.docs.forEach((docSnap) => {
    batch.set(
      docSnap.ref,
      {
        read: false,
        resetAt: nowTimestamp(),
      },
      { merge: true }
    );
  });
  await batch.commit();
  return reads.size;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "8A8 Class Portal Backend",
    timestamp: new Date().toISOString(),
    timezone: "Asia/Ho_Chi_Minh",
  });
});

app.get(
  "/api/me",
  requireFirebaseUser,
  asyncHandler(async (req, res) => {
    res.json({
      ok: true,
      user: {
        uid: req.firebaseUser.uid,
        email: req.firebaseUser.email || null,
        displayName: req.firebaseUser.name || req.userProfile.displayName || null,
      },
      profile: req.userProfile,
    });
  })
);

app.post(
  "/api/admin/popup/reset",
  requireFirebaseUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const count = await resetPopupState();
    res.json({
      ok: true,
      message: "Đã reset trạng thái đọc popup phía server.",
      affectedDocuments: count,
    });
  })
);

app.post(
  "/api/admin/popup",
  requireFirebaseUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const title = String(req.body?.title || "").trim();
    const content = String(req.body?.content || "").trim();
    const active = Boolean(req.body?.active);

    if (!title || !content) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_POPUP",
        message: "title và content là bắt buộc.",
      });
    }

    const ref = await db.collection("popups").add({
      title,
      content,
      active,
      createdAt: nowTimestamp(),
      createdBy: req.firebaseUser.uid,
      createdByRole: req.userProfile.role,
    });

    res.status(201).json({
      ok: true,
      id: ref.id,
    });
  })
);

app.post(
  "/api/admin/students/create",
  requireFirebaseUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    const dob = String(req.body?.dob || "").trim();
    const gender = String(req.body?.gender || "").trim();
    const team = String(req.body?.team || "").trim();
    const classRole = String(req.body?.classRole || "").trim();

    if (!name || !gender || !team) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_STUDENT",
        message: "name, gender và team là bắt buộc.",
      });
    }

    const credentials = makeStudentCredentials(name);

    let createdUser;
    try {
      createdUser = await auth.createUser({
        email: credentials.email,
        password: credentials.password,
        displayName: name,
        disabled: false,
      });

      const userRef = db.collection("users").doc(createdUser.uid);
      const studentRef = db.collection("students").doc(createdUser.uid);

      const batch = db.batch();

      batch.set(userRef, {
        uid: createdUser.uid,
        email: credentials.email,
        displayName: name,
        role: "student",
        classRole,
        team,
        createdAt: nowTimestamp(),
        createdBy: req.firebaseUser.uid,
      });

      batch.set(studentRef, {
        id: createdUser.uid,
        name,
        dob,
        gender,
        team,
        classRole,
        score: 10,
        badges: [],
        history: [],
        createdAt: nowTimestamp(),
      });

      await batch.commit();

      return res.status(201).json({
        ok: true,
        message: "Đã tạo tài khoản học sinh.",
        student: {
          uid: createdUser.uid,
          name,
          email: credentials.email,
          temporaryPassword: credentials.password,
        },
      });
    } catch (error) {
      if (createdUser?.uid) {
        try {
          await auth.deleteUser(createdUser.uid);
        } catch (cleanupError) {
          console.error("Auth cleanup failed:", cleanupError);
        }
      }
      throw error;
    }
  })
);

app.patch(
  "/api/super-admin/users/:uid/role",
  requireFirebaseUser,
  requireAdmin,
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const targetUid = String(req.params.uid || "").trim();
    const nextRole = String(req.body?.role || "").trim();

    if (!targetUid || !USER_ROLES.has(nextRole)) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_ROLE",
        message: "Vai trò phải là student, admin hoặc super_admin.",
      });
    }

    if (targetUid === req.firebaseUser.uid && nextRole !== "super_admin") {
      return res.status(400).json({
        ok: false,
        error: "SELF_DEMOTION_BLOCKED",
        message: "Không thể tự hạ quyền Super Admin hiện tại.",
      });
    }

    const targetAuthUser = await auth.getUser(targetUid);
    const targetEmail = normalizeEmail(targetAuthUser.email);

    if (
      targetEmail === SUPER_ADMIN_EMAIL &&
      nextRole !== "super_admin"
    ) {
      return res.status(400).json({
        ok: false,
        error: "PROTECTED_SUPER_ADMIN",
        message: "Email Super Admin được bảo vệ.",
      });
    }

    await db.collection("users").doc(targetUid).set(
      {
        role: nextRole,
        roleUpdatedAt: nowTimestamp(),
        roleUpdatedBy: req.firebaseUser.uid,
      },
      { merge: true }
    );

    res.json({
      ok: true,
      uid: targetUid,
      role: nextRole,
    });
  })
);

app.delete(
  "/api/super-admin/users/:uid",
  requireFirebaseUser,
  requireAdmin,
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const targetUid = String(req.params.uid || "").trim();

    if (!targetUid || targetUid === req.firebaseUser.uid) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_DELETE",
        message: "Không thể xóa chính Super Admin đang đăng nhập.",
      });
    }

    const targetAuthUser = await auth.getUser(targetUid);
    const targetEmail = normalizeEmail(targetAuthUser.email);

    if (targetEmail === SUPER_ADMIN_EMAIL) {
      return res.status(400).json({
        ok: false,
        error: "PROTECTED_SUPER_ADMIN",
        message: "Không thể xóa tài khoản Super Admin gốc.",
      });
    }

    const profileRef = db.collection("users").doc(targetUid);
    const profileSnap = await profileRef.get();
    const targetRole = profileSnap.data()?.role;

    // This endpoint is intentionally reserved for Super Admin.
    // It can remove admin/student accounts, while the protected account
    // above can never be removed.
    await auth.deleteUser(targetUid);
    await profileRef.delete();

    if (targetRole === "student") {
      await db.collection("students").doc(targetUid).delete().catch(() => {});
    }

    res.json({
      ok: true,
      message: "Đã xóa tài khoản và hồ sơ tương ứng.",
    });
  })
);

app.use((error, _req, res, _next) => {
  console.error("Unhandled server error:", error);
  res.status(500).json({
    ok: false,
    error: "INTERNAL_SERVER_ERROR",
    message: "Đã xảy ra lỗi phía máy chủ.",
  });
});

cron.schedule(
  "0 0 * * *",
  async () => {
    try {
      const count = await resetPopupState();
      console.log(
        `[CRON] ${new Date().toISOString()} — popup state reset; affected=${count}`
      );
    } catch (error) {
      console.error("[CRON] Popup reset failed:", error);
    }
  },
  {
    timezone: "Asia/Ho_Chi_Minh",
  }
);

app.listen(PORT, () => {
  console.log(`8A8 backend listening on port ${PORT}`);
  console.log(`Health endpoint: /api/health`);
  console.log(`Timezone: Asia/Ho_Chi_Minh`);
});
