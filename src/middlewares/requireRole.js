module.exports = function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).render("admin/403", {
        title: "Truy cập bị từ chối",
        message: "Bạn không có quyền truy cập phần này.",
      });
    }
    next();
  };
};
