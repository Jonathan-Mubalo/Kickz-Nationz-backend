require("dotenv").config();

const express = require("express");
const axios = require("axios");
const base64 = require("base-64");
//destructuring MongoClient from mongoDB
const { MongoClient } = require("mongodb");
const app = express();
const PORT = process.env.PORT || 3000;

//Middleware to parse JSON bodies
app.use(express.json());

const cors = require('cors');
// Allow requests specifically from your frontend port
app.use(cors());

// MongoDB connection string
const uri = process.env.MONGODB_URI;
//"mongodb://localhost:27017"

app.use(express.json());
let client, db;

// Function to connect to mongoDB
async function connectionToMongo() {
  client = new MongoClient(uri);
  await client.connect();
  db = client.db("KickzNationz"); //My database name must be here
  console.log("Connected to mongoDB");
}



// Middleware for Basic Authentication 
async function basicAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  // Get the user/password from http headers
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return res.status(401).json({ message: "Authorization header missing or invalid" });
  }

  // Split the credentials into a user/password
  const base64Credentials = authHeader.split(" ")[1];
  const credentials = base64.decode(base64Credentials).split(":");
  const email = credentials[0];
  const encodedPassword = credentials[1];
  const password = base64.decode(encodedPassword);

  // Read MongoDB 
  const collection = db.collection("Users");
  const user = await collection.findOne({ email });

  // If user is not found
  if (!user) {
    return res.status(401).json({ message: "User not found" });
  }

  // Decode and check the password
  const decodedStoredPassword = base64.decode(user.password);
  if (decodedStoredPassword !== password) {
    return res.status(401).json({ message: "Invalid password" });
  }
  req.user = user;
  next();
}



// End point to handle signup
app.post("/signup", async (req, res) => {
  try {

    // GETTING THE USERS INPUTTED DATA
    const collection = db.collection("Users");
    const { signupName, signupEmail, signupPassword, signupConfirmPassword } = req.body;

    // A user name is provided
    if (signupName === "") {
      return res.status(422).json({ userInput: 1, message: "Please provide a valid userName" })
    }

    // Checking if the email includes "@"
    if (!signupEmail.includes("@")) {
      return res.status(422).json({ userInput: 2, message: "Emails should include '@'" })
    }

    // CHECKING IF THE PASSWORD IS LONG ENOUGH
    if (signupPassword.trim().length < 6) {
      return res.status(422).json({ userInput: 3, message: "Password should be 6 characters or more" })
    }

    // Checking if the password matches the confirm password
    if (signupPassword !== signupConfirmPassword) {
      return res.status(422).json({ userInput: 4, message: "Passwords do not match" })
    }

    // CHECKING IF A USERS EMAIL EXISTS IN THE USERS COLLECTION ALREADY
    const emailExists = await collection.findOne({ email: signupEmail });

    if (emailExists) {
      return res.status(409).json({ userInput: 5, message: "Email already exists" })
    }

    // add user to Users collection only if all conditions are met
    const counter = await collection.findOne({ userId: "u1" });
    const newUserId = counter.count + 1;

    const result = await collection.insertOne({
      userId: "u" + newUserId,
      userName: signupName,
      email: signupEmail,
      password: base64.encode(signupPassword),
      createAt: new Date()
    });

    const counterResult = await collection.updateOne({ userId: "u1" }, { $set: { count: newUserId } })

    res.status(201).json({
      message: "User created successfully",
    });

  } catch (error) {
    console.error("Error inserting user: ", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});



// Endpoint to login 
app.post("/login", async (req, res) => {
  try {

    const { loginEmail, loginPassword } = req.body;

    if (!loginEmail) {
      return res.status(400).json({ userInput: 1, message: "Please insert your email" });
    }

    if (!loginPassword) {
      return res.status(400).json({ userInput: 2, message: "Please insert your password" });
    }

    const collection = db.collection("Users");
    const userCollection = await collection.findOne({ email: loginEmail });

    if (!userCollection) {
      return res.status(400).json({
        userInput: 3, message: "User is not found, sign up?",
      });
    }

    if (base64.decode(userCollection.password) !== loginPassword) {
      return res.status(200).json({ userInput: 3, message: "Password or email is incorrect" });
    }

    if (base64.decode(userCollection.password) === loginPassword) {

      return res.status(200).json({
        message: "Password is correct",
        accessTokenUserId: base64.encode(userCollection.email),
        // Note to self: The password is now going to be encoded in base 64 for the second time
        generatedToken: base64.encode(`${userCollection.email}:${userCollection.password}`)

      })
    };
  } catch (error) {
    console.error("Error logging in: ", error);
    res.status(500).json({ message: "Internal server error" });
  }

})



// Apply the basicAuth to all the endpoints that require authentication besides the sign up
app.use(basicAuth);



// Endpoint for displaying all the products that we have
app.get("/products", async (req, res) => {
  try {
    const collection = db.collection("Products");

    const allProducts = await collection.find({}).toArray();

    if (!allProducts || allProducts.length === 0) {
      return res.status(404).json({ message: "No products found" });
    }

    return res.status(200).json({ message: allProducts });

  } catch (error) {
    console.error("Error fetching all products", error);
    res.status(500).json({ message: "Internal server Error" });
  }
});



// Endpoint for viewing extra information about the product details
// CURRENTLY DEEMED USELESS
app.get("/productdetail/:productId", async (req, res) => {
  try {
    const collection = db.collection("Products");

    const productDetail = await collection.findOne({ productId: req.params.productId });
    if (!productDetail) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.status(200).json(productDetail);
  } catch (error) {
    console.error("Error fetching product's details", error);
    res.status(500).json({ message: "Internal server Error" });
  }

});



// Endpoint for selecting product and adding it to your cart
app.post("/selectedproduct", async (req, res) => {
  try {

    // Selecting which collections to access
    const collection = db.collection("Carts");


    // const productsCollection = db.collection("Products");


    const { productId, quantity, encodedEmail, productName, productType, productColor, productSize, currency, price, imageUrls, stockQuantity } = req.body;

    //Checking to see if there are still shoes in stock
    if (stockQuantity === 0) {
      return res.status(400).json({ message: "Product is no longer in stock, you cannot order this shoe." });
    }

    // FINDING THE SHOE THAT NEEDS THE AMOUNT OF SHOES ADDED TO CART TO BE REDUCED
    //    const productUpdate = await productsCollection.findOne({ productId });

    // const newQuantity = stockQuantity - quantity;

    // const updatingProduct = await productsCollection.updateOne({ {productId}, {$set: { stockQuantity: newQuantity}}  })

    const email = base64.decode(encodedEmail);

    const existingCart = await collection.findOne({ email });

    if (existingCart) {

      const arr = existingCart.shoeCart;
      const newArr = arr.unshift(req.body);
      const result = await collection.updateOne({ email }, { $set: { shoeCart: arr } });
      return res.status(200).json({ message: "Cart has been successfully updated" });

    }
    else {

      const result = await collection.insertOne({
        email,
        shoeCart: [{
          productId,
          quantity,
          email,
          productName,
          productType,
          productColor,
          productSize,
          currency,
          imageUrls,
          stockQuantity
        }],
        createdAt: new Date()
      });

        const data = await result;
      console.log( data );

      return res.status(201).json({
        message: "Shoe cart was created successfully",
        productId: result.insertedId
      });
    
    }
  } catch (error) {
    console.error("Error posting product item to cart", error);
    res.status(500).json({ message: "Internal server error" });
  }
});



// End point for posting to your wishlist
app.post("/wishlist", async (req, res) => {
  try {
    const { currency, imageUrl, price, productId, productName, selectedColor, selectedSize, userId, wishlistId } = req.body;


    if (!productId || !productName) {
      return res.status(404).json({ message: "Product not in stock" });
    }

    const collection = db.collection("Wishlist");
    const result = await collection.insertOne({
      currency,
      imageUrl,
      price,
      productId,
      productName,
      selectedColor,
      selectedSize,
      userId,
      wishlistId,
      createdAt: new Date(),
    })

    res.status(201).json({
      message: "Product added to wishlist successfully",
      wishlistId: result.insertedId,
    });
  } catch {
    console.error(" Error posting product to wishlist", error);
    res.status(500).json({ message: "Internal server error" });
  }
});



// Endpoint to get my wishlist items
app.get("/mywishlist/:wishlistId", async (req, res) => {
  try {
    const collection = db.collection("Wishlist");
    const myWishlist = await collection.findOne({ wishlistId: req.params.wishlistId });

    if (!myWishlist) {
      return res.status(404).json({ message: "Wishlist not avaialable,add items to wishlist to have one" });
    }

    res.status(201).json(myWishlist);
  } catch (error) {
    console.error("Error getting your wishlist", error);
    res.status(500).json({ message: "Internal server error " });
  }
});



// Endpoint to edit a wishlist with put request
app.put("/editwishlist/:wishlistId", async (req, res) => {
  try {

    const { selectedColor, selectedSize } = req.body;
    const collection = db.collection("Wishlist");
    const result = await collection.updateOne({ wishlistId: req.params.wishlistId }, { $set: req.body });
    const updatedWishlist = await collection.findOne({ wishlistId: req.params.wishlistId });

    if (!updatedWishlist) {
      return res.status(404).json({ message: "Wishlist item not found" });
    }
    res.status(200).json({ message: "Wishlist updated successfully", updatedWishlist });

  } catch (error) {
    console.error("Cannot find the wishlist to edit", error);
    res.status(500).json({ message: "Internal server error" });
  }
});



// Endpoint to get cart
app.get("/mycart/:cartId", async (req, res) => {
  try {

    const collection = db.collection("Carts");
    const cartItems = await collection.findOne({ cartId: req.params.cartId });

    if (!cartItems) {
      return res.status(404).json({ message: "The cart you requested for is unavailable" });
    }

    res.status(201).json(cartItems);

  } catch (error) {
    console.error("No cart available", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});



// Endpoint used to post my cart to my orders collection
app.post("/postcartinorder", async (req, res) => {
  try {
    const {
      imageUrl,
      userId,
      orderId,
      cartId,
      productId,
      productName,
      productColor,
      productSize,
      currency,
      price,
      quantitiy,
      subTotal,
      paymentMethod,
      fullName,
      city,
      province,
      postalCode,
      country,
      paymentStatus,
      deliveryId,
      orderStatus,
      deliveryDate } = req.body;

    if (!paymentStatus) {
      return res.status(404).json({ message: "Make online payment to place your order" });
    }

    if (!fullName || !city || !province || !postalCode || !country) {
      return res.status(404).json({ message: "Please fill in delivery details" });
    }

    const collection = db.collection("Orders");
    const collection2 = db.collection("Deliveries");
    const result = await collection.insertOne({
      imageUrl,
      userId,
      orderId,
      cartId,
      productId,
      productName,
      productColor,
      productSize,
      currency,
      price,
      quantitiy,
      subTotal,
      paymentMethod,
      fullName,
      city,
      province,
      postalCode,
      country,
      paymentStatus,
      createdAt: new Date(),
    });

    const result2 = await collection2.insertOne({
      imageUrl,
      userId,
      orderId,
      cartId,
      productId,
      productName,
      productColor,
      productSize,
      currency,
      price,
      quantitiy,
      subTotal,
      paymentMethod,
      fullName,
      city,
      province,
      postalCode,
      country,
      paymentStatus,
      deliveryId,
      orderStatus,
      deliveryDate,
      createdAt: new Date(),
    })

    res.status(201).json({
      message: "Order is successfully made",
      orderId: result.insertedId,
    });
  } catch {
    console.error(" Error posting cart to order", error);
    res.status(500).json({ message: "Internal server error" });
  }
});




// Endpoint used to edit a cart using a put request
app.put("/editcart/:cartId", async (req, res) => {
  try {

    const { selectedColor, selectedSize } = req.body;
    const collection = db.collection("Carts");
    const result = await collection.updateOne({ cartId: req.params.cartId }, { $set: req.body });
    const updatedCart = await collection.findOne({ cartId: req.params.cartId });

    if (!updatedCart) {
      return res.status(404).json({ message: "Cart item not found" });
    }
    res.status(200).json({ message: "Cart updated successfully", updatedCart });

  } catch (error) {
    console.error("Cannot find the wishlist to edit", error);
    res.status(500).json({ message: "Internal server error" });
  }
});



// Endpoint used to get a delivery status
app.get("/deliverystatus/:orderId", async (req, res) => {
  try {

    const collection = db.collection("Deliveries");
    const deliveryStatus = await collection.findOne({ orderId: req.params.orderId });

    if (!deliveryStatus) {
      return res.status(404).json({ message: "No delivery present " });
    }

    res.status(201).json(deliveryStatus);
  }
  catch (error) {
    console.error("Unable to make the request", error);
    res.status(500).json({ message: "Internal server error" });
  }
});



// Endpoint used to post review forms
app.post("/postforms", async (req, res) => {

  try {
    const { email, subject } = req.body;
    const collection = db.collection("Contact");

    if (!email || !subject) {
      return res.status(404).json({ message: "Email and subject are required" });
    }

    const result = await collection.insertOne({ ...req.body, createdAt: new Date() });

    res.status(201).json({ message: "Your form has been sent and recieved by admin", formId: result.insertedId });
  } catch (error) {
    console.error("Unable to send and store the request", error);
    res.status(500).json({ message: "Intenral server error" });
  }
});

app.listen(PORT, async () => {
  await connectionToMongo();
  console.log(`Server is running on port ${PORT}`);
});
