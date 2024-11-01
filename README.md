# Pilot Project Backend

This is the server/backend component of the pilot project, a demo application designed to test and refine workflows using AI tools (Cursor AI, V0.dev, and ChatGPT). The backend is built with Node.js and Express, connecting to the TrueLayer API via REST. This application uses MongoDB for data persistence, including user management and authentication.

## Tech Stack

- **Node.js** - JavaScript runtime
- **Express.js** - Web framework for Node.js
- **MongoDB** - NoSQL database
- **Axios** - For making HTTP requests to external APIs (TrueLayer API)
- **Passport.js** - For handling user authentication (OAuth or JWT-based)
- **Joi** - Input validation
- **Winston** - Logging
- **Morgan** - HTTP request logging middleware
- **Jest** - Testing framework
- **Supertest** - For integration testing with Express routes

## Project Setup

### Prerequisites

- Node.js and npm installed
- MongoDB account and database set up
- TrueLayer API credentials

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/AliveSheCried/voilaPilot.git
   cd pilot-backend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Environment Variables**:
   - Create a `.env` file in the root of the project.
   - Add the following variables with your credentials:

     ```plaintext
     NODE_ENV=development
     PORT=5000
     MONGO_URI=<your_mongodb_uri>
     JWT_SECRET=<your_jwt_secret>
     TRUELAYER_CLIENT_ID=<your_truelayer_client_id>
     TRUELAYER_CLIENT_SECRET=<your_truelayer_client_secret>
     ```

4. **Run the server**:
   ```bash
   npm run dev
   ```

## Project Structure

The backend codebase follows a modular structure for maintainability and scalability:

```plaintext
pilot-backend/
├── src/
│   ├── config/               # Configuration files (e.g., env variables, DB config)
│   ├── controllers/          # Functions to handle request logic
│   ├── middleware/           # Custom Express middleware (e.g., error handling, logging)
│   ├── models/               # Mongoose models (database schemas)
│   ├── routes/               # Route definitions (organized by module)
│   ├── services/             # Business logic and API integration functions
│   ├── utils/                # Utility functions (e.g., error classes, helpers)
│   ├── validations/          # Joi validation schemas for incoming requests
│   ├── tests/                # Test files for Jest and Supertest
│   └── index.js              # Main server file (server setup, middleware, and routes)
├── .env                      # Environment variables
├── .eslintrc.js              # Linter configuration
├── .gitignore                # Git ignore file
├── package.json              # Project dependencies and scripts
└── README.md                 # Project documentation
```

## Key Features

- **User Authentication**: Secure user authentication using Passport.js with support for OAuth/JWT.
- **TrueLayer Integration**: Interacts with the TrueLayer API to retrieve financial data securely.
- **Validation**: Uses Joi for validating incoming request data, ensuring data integrity.
- **Logging**: Logs errors and critical operations using Winston, with Morgan for HTTP request logging.
- **Testing**: TDD approach with Jest for unit tests and Supertest for integration tests. Target test coverage is 80%+.

## API Endpoints

**Authentication Routes**
- `POST /api/v1/auth/login`: User login
- `POST /api/v1/auth/logout`: User logout
- `POST /api/v1/auth/register`: User registration

**User Routes**
- `GET /api/v1/users/me`: Fetch authenticated user details

**Developer Console Routes**
- `GET /api/v1/console/keys`: Retrieve user’s API keys
- `POST /api/v1/console/keys`: Generate new API key

## Development

### Running the Server

To start the development server:

```bash
npm run dev
```

### Running Tests

To run all tests:

```bash
npm test
```

To run tests with coverage:

```bash
npm run test:coverage
```

## Contributing

1. Fork the project
2. Create your feature branch (`git checkout -b feature/new-feature`)
3. Commit your changes (`git commit -m 'Add new feature'`)
4. Push to the branch (`git push origin feature/new-feature`)
5. Open a pull request

## License

This project is licensed under the MIT License.

---

Let me know if you’d like any additional sections or details, or if there’s anything specific to this pilot project that I should include.