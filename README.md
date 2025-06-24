# Roshoi Bondhu Server

This is the backend server for **Roshoi Bondhu** — a recipe-sharing platform where users can post, browse, like, and manage recipes. The server is built using **Node.js**, **Express**, and **MongoDB**, and provides RESTful APIs for managing recipes and users.

---

## 🔧 Tech Stack

- **Node.js** & **Express** – Backend framework  
- **MongoDB** & **MongoDB Atlas** – NoSQL Database  
- **dotenv** – For managing environment variables  
- **cors** – Enabling cross-origin requests  
- **ObjectId** – MongoDB unique identifier utility  

---

## 🌍 Live Server

You can deploy this on platforms like **Render**, **Railway**, or **Vercel (for functions)** depending on your hosting choice.

## 📌 API Endpoints

### 🧑‍🍳 Recipes

| Method | Endpoint            | Description                            |
| ------ | ------------------- | -------------------------------------- |
| POST   | `/AllRecipes`       | Add a new recipe                       |
| GET    | `/AllRecipes`       | Get all recipes                        |
| GET    | `/AllRecipes/:id`   | Get a single recipe by ID              |
| GET    | `/AllRecipe/:email` | Get recipes by user email              |
| PUT    | `/AllRecipes/:id`   | Update recipe or like count (upsert)   |
| DELETE | `/AllRecipes/:id`   | Delete a recipe by ID                  |
| GET    | `/top-recipes`      | Get top 8 recipes sorted by like count |

### 👤 Users

| Method | Endpoint | Description    |
| ------ | -------- | -------------- |
| POST   | `/users` | Add a new user |
| GET    | `/users` | Get all users  |




## ⚙️ Setup & Run
bash
Copy
Edit
git clone https://github.com/Sifat2245/roshoi-bondhu-server.git
cd roshoi-bondhu-server
npm install
#### Add your .env file
npm start