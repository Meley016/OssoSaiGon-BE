const Review = require("../models/Review");

exports.getReviews = async (req, res) => {
  const { productId } = req.params;
  const reviews = await Review.find({ product: productId })
    .populate("user", "name")
    .sort({ createdAt: -1 });

  res.json(reviews);
};

exports.addReview = async (req, res) => {
  const { productId } = req.params;
  const { rating, comment } = req.body;

  if (!rating) return res.status(400).json({ msg: "Thiếu số sao!" });

  const review = await Review.create({
    product: productId,
    user: req.user._id,
    rating,
    comment,
  });

  res.json({ success: true, review });
};

exports.deleteReviewAdmin = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const review = await Review.findById(reviewId);

    if (!review) {
      return res.status(404).json({ msg: "Comment không tồn tại" });
    }

    await review.deleteOne();

    res.json({ success: true, msg: "Đã xóa comment" });
  } catch (error) {
    res.status(500).json({ msg: "Lỗi xóa comment" });
  }
};