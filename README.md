# G2A - Gherkin to Automation

Convert Gherkin test cases from CSV to Cypress automation scripts with AI assistance.

## Features

- 📄 Upload CSV files with Gherkin test cases
- 📁 Select Cypress project directories via Windows Explorer dialog
- 🤖 AI-powered context extraction from Page Objects
- 🔄 Automatic generation of Cypress test scripts
- 💾 Learning system that improves suggestions over time

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env and add your OpenAI API key
```

3. Run development server:
```bash
npm run dev
```

This will start:
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## Project Structure

```
g2a/
├── frontend/          # React + Vite frontend
├── backend/           # Node.js + Express backend
└── README.md
```

## Usage

1. Upload CSV file with test cases (columns: Data/Given, Action/When, Expected Result/Then)
2. Select Cypress project directory to extract Page Objects context
3. Let AI analyze and generate Cypress automation scripts





