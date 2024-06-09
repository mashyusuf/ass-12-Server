const express = require('express');
const app = express();
require('dotenv').config();
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_KEY);

const port = process.env.PORT || 8000;

// Middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Verify Token Middleware
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access' });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'Unauthorized access' });
    }
    req.user = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ziugtg4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const medicineCollection = client.db('MedicineDb').collection('medicine');
    const allMedicineCollection = client.db('MedicineDb').collection('allmedicines');
    const CartsCollection = client.db('MedicineDb').collection('carts');
    const UsersCollection = client.db('MedicineDb').collection('users');
    const PaymentsCollection = client.db('MedicineDb').collection('payments');
    const AdvertiesmentCollection = client.db('MedicineDb').collection('ad');
    // Verify Admin Middleware
    const verifyAdmin = async (req, res, next) => {
      const user = req.user;
      const result = await UsersCollection.findOne({ email: user?.email });
      if (!result || result?.role !== 'admin') {
        return res.status(401).send({ message: 'Unauthorized access' });
      }
      next();
    };

    // Verify Seller Middleware
    const verifySeller = async (req, res, next) => {
      const user = req.user;
      const result = await UsersCollection.findOne({ email: user?.email });
      if (!result || result?.role !== 'seller') {
        return res.status(401).send({ message: 'Unauthorized access' });
      }
      next();
    };

    // Auth related API
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '365d' });
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true });
    });

    // Logout
    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          })
          .send({ success: true });
      } catch (err) {
        res.status(500).send(err);
      }
    });

    // Save User Data in DB
    app.put('/user', async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };
      const isExist = await UsersCollection.findOne(query);
      if (isExist) {
        if (user.status === 'Requested') {
          const result = await UsersCollection.updateOne(query, { $set: { status: user?.status } });
          return res.send(result);
        } else {
          return res.send(isExist);
        }
      }
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now(),
        },
      };
      const result = await UsersCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    // Get User Info by Email from DB
    app.get('/user/:email', async (req, res) => {
      const email = req.params.email;
      const result = await UsersCollection.findOne({ email });
      res.send(result);
    });

    //---------------Admin Era------------

    // Get All Users (Admin only)
    app.get('/users', verifyToken,  async (req, res) => {
      const result = await UsersCollection.find().toArray();
      res.send(result);
    });

    //-------Get All medicine For Admin-------
    app.get('/all-medicineForAdmin', verifyToken, verifyAdmin, async (req, res) => {
      const result = await allMedicineCollection.find().toArray();
      res.send(result);
    });

    //---------Admin Can Delete Every thing------
    app.delete('/all-medicineForAdmin/:id',verifyToken ,verifyAdmin,async (req,res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result =await allMedicineCollection.deleteOne(query);
      res.send(result)
    })

    // Update User Status and Role
    app.patch('/user/update/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email };
      const updateDoc = {
        $set: { ...user, timestamp: Date.now() },
      };
      const result = await UsersCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    //Payment Get-----------Manage Payment--------
    app.get('/admin-pay', verifyToken,  async (req, res) => {
      const result = await PaymentsCollection.find().toArray();
      res.send(result);
    });
      
    // Payment Status Update
app.patch('/admin-pay/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = {
      $set: {
          status: 'paid'
      },
  };
  const result = await PaymentsCollection.updateOne(filter, updateDoc);
  if (result.modifiedCount === 1) {
      res.send({ message: 'Payment status updated successfully' });
  } else {
      res.status(404).send({ message: 'Payment not found' });
  }
});

    //-------Post Add Category--------
    app.post('/add-category', verifyToken, verifyAdmin, async (req, res) => {
      const medicineData = req.body;
      const result = await medicineCollection.insertOne(medicineData);
      res.send(result);
    });


    // Get All Category--------

    app.get('/admin-category', verifyToken,  verifyAdmin,async (req, res) => {
      const result = await medicineCollection.find().toArray();
      res.send(result);
    });
    //---------Admin Can Delete Every thing------
    app.delete('/delete-category/:id',verifyToken ,verifyAdmin,async (req,res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result =await medicineCollection.deleteOne(query);
      res.send(result)
    })

    //--------Update Category---------
   
    app.get('/update-category/:id',verifyToken ,verifyAdmin,async (req,res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result =await medicineCollection.findOne(query);
      res.send(result)
    })
    app.put('/update-category/:id', verifyToken, verifyAdmin, async (req, res) => {
      try {
          const id = req.params.id;
          const query = { _id: new ObjectId(id) };
          const updatedData = req.body; // Data to update the category
          const result = await medicineCollection.updateOne(query, { $set: updatedData });
          res.send(result);
      } catch (error) {
          console.error("Update error:", error);
          res.status(500).send("Failed to update category");
      }
  });

    //Admin Dashboard------
    app.get('/admin-dashboard', verifyToken, verifyAdmin, async (req, res) => {
      try {
        // Retrieve payment details with only the price field
        const paymentDetails = await PaymentsCollection.find({}, { projection: { price: 1 } }).toArray();
        
        // Calculate the total price
        const totalPrice = paymentDetails.reduce((sum, medicine) => sum + medicine.price, 0);
    
        // Retrieve total number of users
        const totalUsers = await UsersCollection.countDocuments();
    
        // Log the payment details
        console.log(paymentDetails);
    
        // Send the response to the client
        res.send({ totalPayment: paymentDetails.length, totalPrice, totalUsers });
      } catch (error) {
        // Handle any errors that occur during the process
        console.error("Error fetching admin dashboard data:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });


   // Endpoint to fetch all advertisement medicines
app.get('/advertise-medicines', async (req, res) => {
  try {
    const result = await AdvertiesmentCollection.find({}).toArray();
    res.json(result);
  } catch (error) {
    console.error('Error fetching advertisement medicines:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint to toggle add to slide/remove from slide for a specific advertisement




    //---Admin Sales Get--------
    app.get('/admin-sales', async (req, res) => {
      const result = await PaymentsCollection.find().toArray();
      res.send(result);
    });



    //-----------Users------- Era--------------

    // Get Medicines
    app.get('/medicine', async (req, res) => {
      const result = await medicineCollection.find().toArray();
      res.send(result);
    });

    // Get Medicines by Category
    app.get('/allmedicine/:category', async (req, res) => {
      const medicineCategory = req.params.category;
      try {
        const relatedMedicines = await allMedicineCollection.find({ category: medicineCategory }).toArray();
        res.json(relatedMedicines);
      } catch (error) {
        console.error('Error fetching related medicines:', error);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });

    // Get Medicine Details by ID
    app.get('/card-details/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await allMedicineCollection.findOne(query);
      res.send(result);
    });

    // Get All Shop Medicines
    app.get('/shop-medicine', async (req, res) => {
      const { sort, search } = req.query;
      console.log({ sort, search });
    
      // Create the query object
      const query = {};
      if (search) {
        query.title = { $regex: search, $options: 'i' }; // Case-insensitive search
      }

      //dynamically count----------
      app.get('/medicine-counts', async (req, res) => {
        try {
            const result = await allMedicineCollection.aggregate([
                {
                    $group: {
                        _id: "$category",
                        count: { $sum: 1 }
                    }
                },
                {
                    $project: {
                        category: "$_id",
                        count: 1,
                        _id: 0
                    }
                }
            ]).toArray();
            console.log('Aggregated Counts:', result); // Add logging
            res.send(result);
        } catch (error) {
            console.error('Error fetching medicine counts:', error);
            res.status(500).send({ error: 'Internal Server Error' });
        }
    });
    
    
      // Create the options object
      const options = {
        sort: {
          price: sort === 'asc' ? 1 : -1
        }
      };
    
      try {
        // Execute the query with sorting and filtering
        const result = await allMedicineCollection.find(query, options).toArray();
        res.send(result);
      } catch (error) {
        console.error('Error fetching medicines:', error);
        res.status(500).send('Error fetching medicines');
      }
    });
    

//----------get for discount----------
    app.get('/discounted-products', async (req, res) => {
      try {
        const discountedProducts = await allMedicineCollection.find({ discount: { $exists: true, $ne: 0 } }).toArray();
        res.json(discountedProducts);
      } catch (error) {
        console.error('Error fetching discounted products:', error);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });
    
    // Add Item to Cart
    app.post('/carts', async (req, res) => {
      const cartItem = req.body;
      const result = await CartsCollection.insertOne(cartItem);
      res.send(result);
    });

    // Get Cart Items by Email
    app.get('/carts', async (req, res) => {
      const email = req.query.email;
      const query = { email };
      const result = await CartsCollection.find(query).toArray();
      res.send(result);
    });

    // Delete Item from Cart by ID
    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await CartsCollection.deleteOne(query);
      res.send(result);
    });
    //--------------Seller Era--------------------
    // Add Medicines (Seller only)
    app.post('/add-medicines', verifyToken, verifySeller, async (req, res) => {
      const medicineData = req.body;
      const result = await allMedicineCollection.insertOne(medicineData);
      res.send(result);
    });

    // Get Seller's Listings
    app.get('/my-listings/:email', verifyToken, verifySeller, async (req, res) => {
      const email = req.params.email;
      const query = { 'seller.email': email };
      const result = await allMedicineCollection.find(query).toArray();
      res.send(result);
    });

    
    // Delete Medicine (Seller only)
    app.delete('/medicine-delete/:id', verifyToken, verifySeller, async (req, res) => {
      const id = req.params.id;
      try {
        const query = { _id: new ObjectId(id) };
        const result = await allMedicineCollection.deleteOne(query);
        res.json(result);
      } catch (error) {
        console.error('Error deleting medicine:', error);
        res.status(500).json({ error: 'Error deleting medicine' });
      }
    });

    // Payment Get Only for Seller
    app.get('/payment-seller/:email', async (req, res) => {
      const email = req.params.email;
      const result = PaymentsCollection.find();
      res.send(result);
    });
    

    // Create Payment Intent
    app.post('/create-payment-intent', async (req, res) => {
      try {
        const { price } = req.body;
        if (typeof price !== 'number' || isNaN(price) || price <= 0) {
          return res.status(400).send({ error: 'Invalid price value' });
        }

        const amount = parseInt(price * 100);
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: 'usd',
          payment_method_types: ['card']
        });

        res.send({
          clientSecret: paymentIntent.client_secret
        });
      } catch (error) {
        console.error('Error creating payment intent:', error);
        res.status(500).send({ error: 'Internal Server Error' });
      }
    });


//--------Payment Get Only seller--------

app.get('/payment-seller', verifyToken, verifySeller, async (req, res) => {
  const sellerEmail = req.query.email; // Use req.query.email
  const result = await PaymentsCollection.find({ sellerEmail }).toArray(); // Filter payments by sellerEmail
  res.send(result);
});

    //sellerDashboard------
    app.get('/seller-dashboard', verifyToken, verifySeller, async (req, res) => {
  try {
    const { email } = req.user;

    // Retrieve payment details with only the price field where the seller's email matches
    const paidPayments = await PaymentsCollection.find({ 'sellerEmail': email, 'status': 'paid' }).toArray();
    const pendingPayments = await PaymentsCollection.find({ 'sellerEmail': email, 'status': 'pending' }).toArray();

    // Calculate total amounts
    const totalPaid = paidPayments.reduce((acc, curr) => acc + curr.price, 0);
    const totalPending = pendingPayments.reduce((acc, curr) => acc + curr.price, 0);

    res.send({ totalPaid, totalPending });
  } catch (error) {
    console.error("Error fetching seller dashboard data:", error);
    res.status(500).send({ error: "Internal server error" });
  }
});


    // Advertisements for seller
app.post('/Adver-medicines', verifyToken, async (req, res) => {
  const medicineData = req.body;
  const seller = req.user; // Extract seller information from authenticated user
  medicineData.seller = seller; // Include seller information in medicine data
  medicineData.advertise = true; // Set advertise field to true for advertisement
  try {
      const result = await AdvertiesmentCollection.insertOne(medicineData);
      res.send(result);
  } catch (error) {
      console.error('Error inserting advertisement:', error);
      res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/advertise-medicines', async (req, res) => {
  try {
      const advertisedMedicines = await AdvertiesmentCollection.find().toArray();
      res.send(advertisedMedicines);
  } catch (error) {
      console.error('Error fetching advertised medicines:', error);
      res.status(500).send('Internal Server Error');
  }
});
//-----------------------
app.put('/toggle-advertisement-slide/:id', async (req, res) => {
  try {
      const { addToSlide } = req.body;
      const result = await AdvertiesmentCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { status: addToSlide } }
      );
      if (result.modifiedCount > 0) {
          res.send('Advertisement status updated successfully');
      } else {
          res.status(404).send('Advertisement not found');
      }
  } catch (error) {
      console.error('Error updating advertisement status:', error);
      res.status(500).send('Server error');
  }
});
//---------------payment Era---------------------
    // Get Payment History by Email
    app.get('/payment/:email', verifyToken, async (req, res) => {
      const query = { email: req.params.email };
      const result = await PaymentsCollection.find(query).toArray();
      res.send(result);
    });

    // Post Payment and Delete Items from Cart
app.post('/payments', async (req, res) => {
  const session = client.startSession();
  try {
    session.startTransaction();
    
    const payment = req.body;
    const paymentResult = await PaymentsCollection.insertOne(payment, { session });

    const query = {
      _id: {
        $in: payment.cartIds.map(id => new ObjectId(id))
      }
    };

    const deleteResult = await CartsCollection.deleteMany(query, { session }); // Use CartsCollection instead

    await session.commitTransaction();
    session.endSession();

    res.send({ paymentResult, deleteResult });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error processing payment:', error);
    res.status(500).send({ error: 'Internal Server Error' });
  }
});


    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log('Pinged your deployment. You successfully connected to MongoDB!');
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello from Yousufs Medicine..');
});

app.listen(port, () => {
  console.log(`Medicine is running on port ${port}`);
});
