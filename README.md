# CBL Dealer Report

A full-stack web application for managing dealer reports, built with React, Node.js, and MySQL.

## Features

- **Dashboard**: Welcome page with system overview
- **Target vs Achievement Report**: Track performance against targets
- **Overdue Report**: Monitor overdue payments
- **Credit Days**: Manage credit day allocations
- **Delinquent Dealers**: Track dealers with outstanding issues

## Tech Stack

- **Frontend**: React 18, React Router, Axios
- **Backend**: Node.js, Express
- **Database**: MySQL
- **Icons**: Lucide React

## Project Structure

```
cbl-dealer-report/
├── client/                 # React frontend
│   ├── public/
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── pages/         # Page components
│   │   ├── App.js
│   │   └── index.js
│   └── package.json
├── server/                # Node.js backend
│   ├── index.js          # Express server
│   └── .env.example      # Environment variables template
├── package.json          # Root package.json
└── README.md
```

## Installation

1. **Install root dependencies**:
   ```bash
   npm install
   ```

2. **Install client dependencies**:
   ```bash
   cd client
   npm install
   cd ..
   ```

   Or use the convenience script:
   ```bash
   npm run install-all
   ```

3. **Set up MySQL Database**:
   - Create a database named `cbl_dealer_report` in MySQL Workbench
   - Copy `server/.env.example` to `server/.env`
   - Update the database credentials in `server/.env`:
     ```
     DB_HOST=localhost
     DB_USER=root
     DB_PASSWORD=your_password
     DB_NAME=cbl_dealer_report
     ```

## Running the Application

### Development Mode (Runs both frontend and backend)

```bash
npm run dev
```

This will start:
- Backend server on `http://localhost:5000`
- React frontend on `http://localhost:3000`

### Run Separately

**Backend only**:
```bash
npm run server
```

**Frontend only**:
```bash
npm run client
```

## Environment Variables

Create a `server/.env` file with the following variables:

```
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=cbl_dealer_report
```

## API Endpoints

- `GET /api/health` - Health check endpoint
- `GET /api/welcome` - Welcome message and module list

## Future Development

The following modules are ready for implementation:
- Target vs Achievement Report
- Overdue Report
- Credit Days
- Delinquent Dealers

## License

ISC


