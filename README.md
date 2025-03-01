# Pilot Project Backend

This is the server/backend component of the pilot project, a demo application designed to test and refine workflows using AI tools (Cursor AI, V0.dev, and ChatGPT). The backend is built with Node.js and Express, connecting to the TrueLayer API via REST. This application uses MongoDB for data persistence, including user management and authentication.

> For detailed documentation about the services, caching strategy, rate limiting, and monitoring aspects of the application, please see the [Services Documentation](../README.md).

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
- `GET /api/v1/console/keys`: Retrieve user's API keys
- `POST /api/v1/console/keys`: Generate new API key
- `DELETE /api/v1/console/keys/:keyId`: Deactivate an API key
- `GET /api/v1/console/metrics`: Get API usage metrics (admin only)
- `POST /api/v1/console/cache/clear`: Clear API response cache (admin only)
- `GET /api/v1/console/health`: Service health check

## API Key Management System

The API Key Management System provides secure key generation, storage, and validation for API access control.

### Features

- **Secure Key Generation**: Cryptographically secure API key generation with prefix-based identification
- **Key Lifecycle Management**: Automatic expiration and cleanup of unused keys
- **Usage Monitoring**: Track key usage patterns and detect suspicious activity
- **Role-Based Access**: Different rate limits and permissions based on user roles
- **Performance Optimization**: LRU caching and database indexing for fast key validation
- **Security Measures**: Key hashing, masking of sensitive data, and rate limiting

### Architecture

#### Key Structure
- Format: `vk_[43 characters]`
- Prefix: `vk_` identifies keys from our service
- Body: URL-safe base64 encoded random bytes

#### Storage
- Keys are stored in MongoDB with the following schema:

  ```javascript
  {
    key: String,          // Masked in responses
    name: String,         // User-provided identifier
    hashedKey: String,    // Bcrypt hash for verification
    lastUsed: Date,       // Last usage timestamp
    createdAt: Date,      // Creation timestamp
    expiresAt: Date,      // Expiration date
    isActive: Boolean     // Key status
  }
  ```

#### Security Features

1. **Key Storage**
   - Keys are never stored in plain text
   - Bcrypt hashing for secure storage
   - Automatic masking in logs and responses

2. **Rate Limiting**
   - Role-based limits (e.g., higher limits for admin users)
   - Endpoint-specific configurations
   - IP and user-based tracking

3. **Monitoring**
   - Real-time suspicious activity detection
   - Response time monitoring
   - Usage metrics and analytics

4. **Caching**
   - LRU cache for frequently accessed keys
   - Configurable TTL and cache size
   - Automatic cleanup of expired entries

### Usage Examples

1. **Retrieving API Keys**

   ```bash
   curl -X GET "http://localhost:3000/api/v1/console/keys" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   ```

2. **Creating a New API Key**

   ```bash
   curl -X POST "http://localhost:3000/api/v1/console/keys" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name": "My API Key"}'
   ```

3. **Deactivating an API Key**

   ```bash
   curl -X DELETE "http://localhost:3000/api/v1/console/keys/KEY_ID" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   ```

### Configuration

The API Key Management System can be configured through environment variables:

```plaintext
# Cache Configuration
CACHE_TTL=60000                    # Cache TTL in milliseconds
CACHE_MAX_SIZE=1000                # Maximum cache entries
CACHE_CLEANUP_INTERVAL=300000      # Cleanup interval in milliseconds

# Rate Limiting
RATE_LIMIT_WINDOW=900000           # 15 minutes in milliseconds
RATE_LIMIT_MAX=100                 # Maximum requests per window
RATE_LIMIT_ADMIN_MAX=1000         # Maximum requests for admin users
```

### Monitoring and Metrics

Administrators can access usage metrics through the `/api/v1/console/metrics` endpoint, which provides:

- Request counts by endpoint
- Average response times
- Active user counts
- Cache performance statistics
- Rate limit breach attempts

### Best Practices

1. **Key Management**
   - Regularly rotate API keys (recommended every 90 days)
   - Use descriptive names for keys to track their purpose
   - Deactivate unused keys promptly

2. **Security**
   - Never log full API keys
   - Use HTTPS for all API communications
   - Implement proper error handling to avoid key exposure

3. **Performance**
   - Monitor cache hit rates
   - Use appropriate indexing for your usage patterns
   - Configure rate limits based on your application needs

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