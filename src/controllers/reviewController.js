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
