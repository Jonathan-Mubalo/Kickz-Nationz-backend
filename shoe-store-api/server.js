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

     const result = await collection.insertOne({
      userName: signupName,
      email: signupEmail,
      password: base64.encode(signupPassword),
      createAt: new Date()
    });


    res.status(200).json({
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
app.post("/selectedproduct/:encodedEmail", async (req, res) => {
  try {

    const collection = db.collection("Carts");
    const { encodedEmail } = req.params

    // const productsCollection = db.collection("Products");


    const { productId, quantity, productName, productType, productColor, productSize, currency, price, imageUrls, stockQuantity } = req.body;

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

      const arr = existingCart.shoppingCart;
      const newArr = arr.unshift(req.body);
      const result = await collection.updateOne({ email }, { $set: { shoppingCart: arr } });
      return res.status(200).json({ message: "Cart has been successfully updated" });

    }
    else {

      const result = await collection.insertOne({
        email,
        shoppingCart: [{
          productId,
          quantity,
          productName,
          productType,
          productColor,
          productSize,
          currency,
          price,
          imageUrls,
          stockQuantity
        }],
        createdAt: new Date()
      });

      const data = await result;
      console.log(data);

      return res.status(200).json({
        message: "Wishlist cart was created successfully"
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

    const collection = db.collection("Wishlist");
    const { productId, quantity, encodedEmail, productName, productType, productColor, productSize, currency, price, imageUrls, stockQuantity } = req.body;


    // Decoding the base64 encoded email
    const email = base64.decode(encodedEmail);

    const user = await collection.findOne({ email });

    if (stockQuantity === 0) {
      return res.status(404).json({ message: "Shoe not in stock" });
    }

    else if (!productSize) {

      return res.status(400).json({
        message: "Select a shoe size before adding the shoe to your wishlist"
      });
    }


    // If the user is found inside the wishlist cart we are going to update their wishlistCart 

    else if (user && !quantity) {

      const arr = user.wishlistCart;

      // Adding the shoe to the already existing cart 
      const newArr = arr.unshift({ ...req.body, quantity: 1, addedOn: new Date() });

      const response = await collection.updateOne({ email }, { $set: { wishlistCart: arr, addedOn: new Date() } });

      return res.status(200).json({ message: "The selected shoe has been successfully added to your wishlist cart" })
    }

    else if (user) {

      const arr = user.wishlistCart;

      // Adding the shoe to the already existing cart 
      const newArr = arr.unshift({ ...req.body, addedOn: new Date() });

      const response = await collection.updateOne({ email }, { $set: { wishlistCart: arr } });

      return res.status(200).json({ message: "The selected shoe has been successfully added to your wishlist cart" })
    }

    else if (!quantity) {

      const response = await collection.insertOne({
        email,
        wishlistCart: [{
          price,
          productId,
          quantity: 1,
          email,
          productName,
          productType,
          productColor,
          productSize,
          currency,
          imageUrls,
          stockQuantity,
          addedOn: new Date()
        }],
        createdAt: new Date()
      });

      return res.status(200).json({
        message: "Product added to your wishlist successfully"
      });
    }
    else {

      const response = await collection.insertOne({
        email,
        wishlistCart: [{
          price,
          productId,
          quantity,
          email,
          productName,
          productType,
          productColor,
          productSize,
          currency,
          imageUrls,
          stockQuantity,
          addedOn: new Date()
        }],
        createdAt: new Date()
      });

      return res.status(200).json({
        message: "Product added to wishlist successfully"
      })
    }





  } catch (error) {
    console.error(" Error posting product to wishlist", error);
    res.status(500).json({ message: "Internal server error" });
  }
});



// Endpoint to get my wishlist items
app.get("/mywishlist/:encodedEmail", async (req, res) => {
  try {
    const collection = db.collection("Wishlist");
    const { encodedEmail } = req.params;

    const email = base64.decode(encodedEmail);
    const myWishlist = await collection.findOne({ email });

    if (!myWishlist) {
      return res.status(404).json({ message: "Wishlist not avaialable, add items to your wishlist" });
    }
    else {
      res.status(200).json({ message: myWishlist });
    }

  } catch (error) {
    console.error("Error getting your wishlist", error);
    res.status(500).json({ message: "Internal server error " });
  }
});



//Endpoint used to remove a shoe from the wishlist
app.post('/removeFromWishlist/:encodedEmail', async (req, res) => {
  try {

    // CONNECTING TO THE COLLECTION THAT MUST BE USED
    const collection = db.collection("Wishlist");

    // Decoding the email to find the users collection and make the update to their collection
    const { encodedEmail, position } = req.params;

    const email = base64.decode(encodedEmail);

    const user = await collection.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "Users wishlist is non-existent" });
    }

    if (user) {

      // Collecting the array that has all of the shoes found inside of the wishlist
      const arr = user.wishlistCart;

      const removed = arr.splice(position, 1);

      const update = await collection.updateOne({ email }, { $set: { wishlistCart: arr } });

      return res.status(200).json({ message: `Successfully removed ${removed} from the wishlist` });

    }

  }
  catch (error) {
    console.error("There was an error trying to remove a shoe from the wishlist: ", error);
    res.status(500).json({ message: "Internal server error" });
  }
})



// ENDPOINT USED TO ADD A WISHLIST ITEM TO THE CART



// Endpoint to edit a wishlist with put request by reomving items that were added to a users cart
app.put("/editwishlist/:encodedEmail", async (req, res) => {
  try {

    // Getting the array containing the updated shoe item to remove from the wishlist
    // Also getting the object that should be added to the carts document of the customer
    const { wishlistCart, shoeObject } = req.body;

    // 
    const collection = db.collection("Wishlist");
    const cartsCollection = db.collection("Carts");

    // GETTING THE ACTUAL EMAIL TO FIND THE USERS CART AND MAKE THE NECESSARY CHANGES

    const { encodedEmail } = req.params;
    const email = base64.decode(encodedEmail);

    // FINDING THE CART AND WISHLIST OF A USER USING THEIR EMAIL
    const wishlist = await collection.findOne({ email });
    const cart = await cartsCollection.findOne({ email });

    // Checking to see that users wishlist actually exists before carrying out other actions
    if (!wishlist) {
      return res.status(404).json({ message: "Unable to get your wishlist items" });
    }

    if (!cart) {

      const newCart = await cartsCollection.insertOne({
        email,
        shoppingCart: [shoeObject],
        createdAt: new Date()
      });

      // DELETING THE ITEM FROM THE WISHLIST DOCUMENT
      const result = await collection.updateOne({ email }, { $set: { wishlistCart } });
      return res.status(200).json({ message: "Wishlist updated successfully", result });
    }

    if (cart) {

      // DESTRUCTURING THE SHOE TO MANUALLY ADDED IT TO THW SHES COLLECTION
      const { shoppingCart } = cart;
      const newShoppingCart = shoppingCart.unshift(shoeObject)
      const existingCart = await cartsCollection.updateOne({ email }, { $set: { shoppingCart } })
      const result = await collection.updateOne({ email }, { $set: { wishlistCart } });
      return res.status(200).json({ message: `Wishlist updated successfully, ${shoeObject}` });
    }


  } catch (error) {
    console.error("Cannot find the wishlist to edit", error);
    res.status(500).json({ message: "Internal server error" });
  }
});



// Endpoint to get cart
app.get("/mycart/:encodedEmail", async (req, res) => {
  try {

    // Getting email to access the right cart from the carts collection
    const collection = db.collection("Carts");
    const { encodedEmail } = req.params;

    const email = base64.decode(encodedEmail);

    const cartItems = await collection.findOne({ email });

    if (!cartItems) {
      return res.status(404).json({ message: "The cart you requested for is unavailable" });
    }

    return res.status(200).json({ message: cartItems.shoppingCart });

  } catch (error) {
    console.error("No cart available", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});




// Endpoint used to edit a cart using a put request
app.put("/editcart/:encodedEmail", async (req, res) => {
  try {

    // Getting the right email so that you can access the right cart
    const { encodedEmail } = req.params;
    const email = base64.decode(encodedEmail);

    const { shoppingCart, totalPrice } = req.body;
    const collection = db.collection("Carts");
    const result = await collection.updateOne({ email }, { $set: { shoppingCart, totalPrice } });
    const updatedCart = await collection.findOne({ email });

    if (!updatedCart) {
      return res.status(404).json({ message: "Cart item not found" });
    }

    return res.status(200).json({ message: updatedCart.shoppingCart });

  } catch (error) {
    console.error("Problem while editting the cart", error);
    res.status(500).json({ message: "Internal server error" });
  }
});




// Endpoint used to post my cart to my orders collection
app.post("/postcartinorder/:encodedEmail", async (req, res) => {
  try {

    const ordersCollection = db.collection("Orders");
    const cartsCollection = db.collection("Carts");

    const { encodedEmail } = req.params;

    // DECODE EMAIL TO ACCESSS THE RIGHT CART

    const email = base64.decode(encodedEmail);

    const cart = await cartsCollection.findOne({ email });

    if (!cart) {
      return res.status(404).json({ message: "The current cart that you are trying to pay for is not found; please try again later" })
    }

    else {

      delete cart["_id"]
      ordersCollection.insertOne({
        ...cart, ...req.body
      })

      return res.status(200).json({ message: "Cart successfully added to your orders collection", orderId: cart.insertedId });

    }

  } catch (error) {
    console.error(" Error posting cart to order", error);
    res.status(500).json({ message: "Internal server error" });
  }
});



// Endpoint used to get a delivery status
app.get("/deliverystatus/:encodedEmail", async (req, res) => {
  try {

    const collection = db.collection("Orders");
    const { encodedEmail } = req.params;

    // DECODING THE ENCODED EMAIL
    const email = base64.decode(encodedEmail);

    const currentDeliveryStatus = await collection.find({ email }).toArray();
    const deliveryStatus = currentDeliveryStatus.reverse();

    if (!deliveryStatus) {
      return res.status(404).json({ message: "No delivery currently available" });
    }
else{
  console.log(deliveryStatus)
    res.status(201).json({message: deliveryStatus, insertedId: deliveryStatus["_id"] });
}
  }
  catch (error) {
    console.error("Unable to collect delivery details", error);
    res.status(500).json({ message: "Internal server error" });
  }
});



// Endpoint used to post review forms
app.post("/postforms", async (req, res) => {

  try {
    const { message } = req.body;
    const collection = db.collection("Contact");

    if ( !message ) {
      return res.status(404).json({ message: "Review message is required" });
    }

    const result = await collection.insertOne({ ...req.body, createdAt: new Date() });

    res.status(200).json({ message: "Your form has been sent and recieved by admin", formId: result.insertedId });
  } catch (error) {
    console.error("Unable to send and store the request", error);
    res.status(500).json({ message: "Intenral server error" });
  }
});

app.listen(PORT, async () => {
  await connectionToMongo();
  console.log(`Server is running on port ${PORT}`);
});
