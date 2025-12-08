require("dotenv").config();
const { sendEmail } = require("./utils/email");

(async () => {
  const fakeOrder = {
    orderCode: "OSO123456",
    total: "2.450.000₫",
    status: "Completed",
    email: "abc160cba@gmail.com",
    name: "Nguyen Van A",

    shippingAddress: {
      fullName: "Nguyen Van A",
      phone: "0909 123 456",
      street: "123 Nguyen Trai",
      ward: "Ward 7",
      district: "District 5",
      city: "Ho Chi Minh City",
    },

    promotion: {
      nameOrCode: "SALE10"
    },

    items: [
      {
        productName: "OSO Hoodie",
        quantity: 1,
        price: "1.450.000₫",
        variantInfo: {
          color: "Black",
          size: "M",
          coverImage: "https://via.placeholder.com/120"
        }
      },
      {
        productName: "OSO T-Shirt",
        quantity: 2,
        price: "500.000₫",
        variantInfo: {
          color: "White",
          size: "L",
          coverImage: "https://via.placeholder.com/120"
        }
      }
    ]
  };

  await sendEmail({
    to: fakeOrder.email,
    subject: `OSOSAIGON - Order Confirmation ${fakeOrder.orderCode}`,
    templateName: "order-confirmation",
    variables: {
      logo: "https://ososaigon.com/logo.png",

      name: fakeOrder.name,
      email: fakeOrder.email,
      orderCode: fakeOrder.orderCode,
      total: fakeOrder.total,
      status: fakeOrder.status,

      shippingAddress: fakeOrder.shippingAddress,
      promotion: fakeOrder.promotion,
      items: fakeOrder.items
    },
  });

  console.log("✅ Test order email sent!");
})();
