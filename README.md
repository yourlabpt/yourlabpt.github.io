# YourLab Business Card Website

A beautiful, modern single-page business card website with an intelligent chat agent that collects business ideas and customer contact information.

## Features

✨ **Modern Design**
- Dark grey gradient background
- Sleek, modern UI with smooth animations
- Responsive design that works on all devices
- Beautiful hover effects and transitions

🤖 **Intelligent Chat Agent**
- Real AI conversation flow with session memory
- Offline-only lead bot mode configurable from `.env` (`CHAT_MODE=offline`)
- Automatic extraction and enrichment of lead data (name, email, phone, business context)
- Lead qualification scoring and stage tracking (discover, qualify, capture, commit)
- Human-style conversation prompts tuned for business discovery

💾 **Secure Data Storage**
- Client-side local storage for immediate backup
- Server-side secure storage in JSON files
- Admin endpoints to view and manage all inquiries
- Timestamped records for each conversation
- Automatic lead-summary email notifications for newly qualified contacts

🎨 **Company Branding**
- Display your dark logo prominently
- Showcase your work with Instagram post gallery
- Professional company description
- Modern typography and color scheme

## Project Structure

```
website/
├── index.html           # Main page
├── styles.css           # Modern styling
├── script.js            # Chat agent logic
├── server/
│   ├── server.js        # Express.js backend
│   ├── package.json     # Dependencies
│   └── inquiries/       # Stored inquiry data
├── Logos YourLab/       # Your company logos
└── post Intro/          # Instagram post images
```

## Installation & Setup

### Option 1: Frontend Only (Local Storage)
If you just want to test locally without a backend:

1. Open `index.html` in your browser
2. The chat data will be saved to browser local storage
3. View saved inquiries in the browser console: `showSavedConversations()`

### Option 2: Full Setup (With Backend)

**Prerequisites:**
- Node.js (v14 or higher)
- npm

**Steps:**

1. **Install backend dependencies:**
```bash
cd website/server
npm install
```

2. **Configure environment variables:**
```bash
cp .env.example .env
```
Then set:
- `CHAT_MODE` (`auto` or `offline`)
  - `auto`: use local models and fallback when needed
  - `offline`: disable all model calls and use the offline lead bot only
- `OLLAMA_BASE_URL`, `OLLAMA_MODEL_SMALL`, `OLLAMA_MODEL_BIG` (when `CHAT_MODE=auto`)
- `LEAD_NOTIFY_TO` (email address that receives new lead summaries)
- SMTP settings (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`)
- `ADMIN_PASSWORD` (password used on the `/admin/` dashboard)

3. **Run the server:**
```bash
npm start
```

The server will start on `http://localhost:3000`

4. **Access the website:**
Open your browser and go to `http://localhost:3000`

5. **Access the admin dashboard:**
Open `http://localhost:3000/admin/`  
(`admin.html` remains only as a compatibility redirect)

## API Endpoints

### Save Inquiry (POST)
```
POST /api/save-inquiry
Body: {
  timestamp: string,
  contact: {
    name: string,
    email: string,
    phone: string
  },
  businessIdea: string,
  messages: array
}
```

### AI Chat Turn (POST)
```
POST /api/chat
Body: {
  sessionId: string,
  language: "en" | "pt",
  message: string
}
```
Returns assistant reply, lead stage, lead score, and save/notification status.

### Get All Inquiries (GET)
```
GET /api/inquiries
Returns: { count: number, inquiries: array }
```

### Get Single Inquiry (GET)
```
GET /api/inquiries/:filename
```

### Delete Inquiry (DELETE)
```
DELETE /api/inquiries/:filename
```

### Health Check (GET)
```
GET /api/health
Returns: { status: string, timestamp: string, inquiriesCount: number }
```

## Customization

### Change Colors
Edit the CSS variables in `styles.css`:
```css
:root {
    --primary-dark: #1a1a1a;      /* Main background */
    --secondary-dark: #2d2d2d;    /* Card background */
    --accent-color: #00d4ff;      /* Cyan highlight */
    --text-light: #e0e0e0;        /* Main text */
}
```

### Update Logo & Images
Replace image paths in `index.html`:
- Logo: `../Logos YourLab/1.png`
- Gallery images: Update paths in gallery section

### Modify Chat Flow
Edit `script.js` function `processUserMessage()` to customize the conversation logic.

## Deployment

### Deploy to Netlify (Frontend Only)
1. Push code to GitHub
2. Connect to Netlify
3. Set build command: (leave empty)
4. Set publish directory: `website`

### Deploy Backend to Heroku
1. Create a Procfile in `server/`:
```
web: node server.js
```

2. Deploy:
```bash
heroku create yourlab-api
git push heroku main
```

### Deploy to Your Own Server
1. Install Node.js on your server
2. Clone repository
3. Run `npm install` in `server/` directory
4. Use PM2 for process management:
```bash
npm install -g pm2
pm2 start server.js
pm2 startup
pm2 save
```

## Viewing Inquiries

### From Admin Dashboard
Access `/api/inquiries` in your browser to see all collected inquiries in JSON format.

### From File System
All inquiries are stored in `server/inquiries/` directory as JSON files.

### From Browser Console
```javascript
// If using local storage only
showSavedConversations()
```

## Features in Detail

### Chat Agent Intelligence
- Automatically detects email addresses, phone numbers, and names in user input
- Validates contact syntax (phone/email) and enforces at least one contact channel
- In offline mode: asks phone first, falls back to email if refused
- Asks follow-up questions based on collected information
- Prevents duplicate data requests
- Guides users through the entire inquiry process

### Responsive Design
- Mobile-first approach
- Adapts to all screen sizes
- Touch-friendly interface
- Optimized for phone and tablet viewing

### Smooth Animations
- Fade-in effects for page elements
- Hover animations on clickable elements
- Smooth transitions for all interactive elements
- Staggered animations for visual appeal

## Browser Support
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

## License
© 2025 YourLab. All rights reserved.

## Support
For issues or questions, please contact your YourLab team.
