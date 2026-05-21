# QCore - Professional QA/QC Construction Management System

A modern, enterprise-level React + Vite web application for managing field reports, lab tests, and construction QA/QC workflows.

## 🚀 Quick Start

### Prerequisites
- Node.js v18+
- npm or yarn
- Supabase account (for backend)

### Installation

```bash
# Navigate to frontend directory
cd field-report-dashboard/frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit `http://localhost:5174` to access the application.

## 📋 Main Features

### 1. Dashboard
- View all projects
- Search and filter projects
- Create new projects
- Status overview with stats

### 2. Project Workspace
- Professional project details header
- Quick access to Field Reports and Lab Reports
- Module cards with descriptions and action buttons
- Project metadata (number, client, location, dates)

### 3. Field Reports Module
- **View Reports**: Table view with search, filters, and sorting
  - Search by report number or inspector
  - Filter by status (Draft, Submitted, Rejected)
  - Filter by date
  - Quick actions (View, Export PDF)

- **Create Field Report**: Multi-section form
  - General Information (date, weather, inspector)
  - Manpower Details (workers, supervisors, contractors)
  - Equipment Used (list and hours)
  - Work Activities (description, location, progress)
  - QA/QC Observations (observations, issues, corrective actions)
  - Safety Notes (incidents, PPE compliance)
  - Attachments (photos, documents)

- **Actions**:
  - Save as Draft
  - Submit for Review
  - Export to PDF
  - Upload attachments

### 4. Lab Reports Module
- View lab test reports
- Test types: Concrete Compression, Soil Compaction, Aggregate Testing
- Test results and status tracking
- Technician information
- Quick export and view options

## 📁 File Structure

```
src/
├── pages/
│   ├── Dashboard.jsx                 # Projects dashboard
│   ├── ProjectWorkspace.jsx          # Project overview & modules
│   ├── FieldReports.jsx              # Field reports list/table
│   ├── CreateFieldReport.jsx         # Create field report form
│   ├── LabReports.jsx                # Lab reports list
│   ├── Reports.jsx                   # Legacy reports (can deprecate)
│   ├── Login.jsx                     # Login page
│   └── ProjectDetails.jsx            # Project details (if used)
├── layouts/
│   └── MainLayout.jsx                # Main app layout
├── components/
│   ├── Sidebar.jsx                   # Navigation sidebar
│   ├── Navbar.jsx                    # Top navigation
│   └── StatCard.jsx                  # Dashboard stat cards
├── services/
│   └── supabase.js                   # Supabase client config
├── App.jsx                           # Main app component with routes
├── App.css                           # Global styles
├── index.css                         # Tailwind CSS imports
└── main.jsx                          # App entry point
```

## 🛣️ Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | Dashboard | Projects list and overview |
| `/login` | Login | User authentication |
| `/project/:projectId` | ProjectWorkspace | Project overview with modules |
| `/project/:projectId/field-reports` | FieldReports | Field reports list |
| `/project/:projectId/field-reports/create` | CreateFieldReport | Create/edit field report |
| `/project/:projectId/lab-reports` | LabReports | Lab reports list |
| `/project/:projectId/lab-reports/create` | CreateLabReport | Create lab report (future) |

## 🎨 Design System

### Colors
- **Primary**: Blue (for actions and highlights)
- **Success**: Green (for completed/approved items)
- **Warning**: Yellow (for drafts/pending items)
- **Error**: Red (for rejections/issues)
- **Neutral**: Gray (background, borders, text)

### Components
- Professional cards with shadows
- Gradient backgrounds
- Responsive tables
- Multi-section forms with tabs
- Status badges
- Action buttons with icons

### Responsive Breakpoints
- Mobile: < 768px (single column)
- Tablet: 768px - 1024px (2 columns)
- Desktop: > 1024px (full layout)

## 🔧 Technical Stack

### Frontend
- **React 18.3** - UI library
- **Vite 8** - Build tool
- **React Router 7.15** - Routing
- **Tailwind CSS 3.4** - Styling
- **Lucide React 0.446** - Icons
- **Recharts 3.8** - Charts (future)

### Backend
- **Supabase** - PostgreSQL database + auth
- **PostCSS 8.5** - CSS processing
- **Autoprefixer 10.5** - Browser compatibility

### Additional
- **Axios 1.16** - HTTP client
- **React PDF 10.4** - PDF handling
- **PDF.js 5.7** - PDF rendering

## 🔐 Authentication

The app uses Supabase Authentication:
- Automatic session checking on app load
- Protected routes (only authenticated users see app)
- Login page for unauthenticated users
- Session persistence

## 💾 Data Integration

### Current State
- Components use sample/hardcoded data
- Ready for Supabase integration

### To Connect to Supabase

1. **Fetch Projects** in `Dashboard.jsx`
2. **Fetch Project Details** in `ProjectWorkspace.jsx`
3. **Fetch Field Reports** in `FieldReports.jsx`
4. **Create Field Reports** via form submission
5. **Upload Attachments** to Supabase Storage
6. **Generate Reports** with PDF export

See `QCORE_IMPLEMENTATION.md` for detailed integration steps.

## 📊 Sample Data

The application includes sample data:
- 3 sample projects
- 3 sample field reports
- 3 sample lab reports

Replace with real data by:
1. Fetching from Supabase
2. Using React hooks (useState, useEffect)
3. Implementing error handling

## 🚀 Key Features

✅ **Professional UI** - Enterprise-level design with modern aesthetics  
✅ **Responsive** - Works on desktop, tablet, and mobile  
✅ **Multi-section Forms** - Organized field report creation  
✅ **Search & Filter** - Find reports quickly  
✅ **Status Tracking** - Draft, submitted, approved workflow  
✅ **File Uploads** - Attach photos and documents  
✅ **PDF Export** - Generate reports as PDFs  
✅ **Icons** - 50+ Lucide icons for visual clarity  
✅ **Tailwind CSS** - Utility-first styling  
✅ **Modular Components** - Reusable and maintainable  

## 📝 Form Sections

### Field Report Sections
1. **General** - Auto-generated report #, date, weather
2. **Manpower** - Worker count, supervisors, contractors
3. **Equipment** - Equipment list and usage hours
4. **Work** - Activities, location, progress percentage
5. **QA/QC** - Observations, issues, corrective actions
6. **Safety** - Incidents, PPE compliance, remarks
7. **Attachments** - Photos and documents

### Status Options
- Draft (saved but not submitted)
- Submitted (awaiting review)
- Approved (passed QA)
- Rejected (needs corrections)

## 🔍 Search & Filter Features

### Field Reports Table
- **Search**: By report number or inspector name
- **Filter by Status**: All, Draft, Submitted, Rejected
- **Filter by Date**: Select specific date range
- **Actions**: View details, export PDF

## 🎯 Development Tips

### Adding New Components
1. Create file in `/pages` or `/components`
2. Import necessary Lucide icons
3. Use existing color scheme
4. Follow responsive design patterns
5. Use Tailwind classes (avoid custom CSS when possible)

### Styling Guidelines
- Use Tailwind CSS classes
- Follow spacing scale: px-4, py-3, gap-4
- Rounded corners: rounded-lg, rounded-xl
- Shadows: shadow-md for cards, shadow-lg for hover
- Colors: Use gray-50 to gray-900, blue-600, green-600

### Adding Database Integration
1. Update `supabase.js` if needed
2. Use `useEffect` to fetch data
3. Handle loading and error states
4. Replace sample data with real data
5. Test with Supabase tables

## 📱 Mobile Optimization

All components are mobile-responsive:
- Sidebar collapses on mobile
- Tables stack vertically or scroll horizontally
- Forms adapt to narrow screens
- Touch-friendly button sizes (min 44x44px)

## 🔐 Security Considerations

- Implement row-level security (RLS) in Supabase
- Validate all form inputs
- Use environment variables for API keys
- Implement role-based access control
- Add audit trails for important actions

## 🚀 Deployment

### Build for Production
```bash
npm run build
```

### Preview Build
```bash
npm run preview
```

### Deployment Options
- **Vercel** (recommended for Vite)
- **Netlify**
- **GitHub Pages**
- **Docker container**

## 📚 Additional Resources

- [Tailwind CSS Docs](https://tailwindcss.com)
- [Lucide Icons](https://lucide.dev)
- [React Router Docs](https://reactrouter.com)
- [Supabase Docs](https://supabase.com/docs)
- [Vite Docs](https://vitejs.dev)

## 🐛 Troubleshooting

### Tailwind CSS not applying
- Check `tailwind.config.js` content paths
- Verify `index.css` imports
- Rebuild with `npm run dev`

### Routes not working
- Check `App.jsx` route definitions
- Verify component imports
- Check console for errors

### Supabase connection issues
- Verify `.env` variables
- Check Supabase project settings
- Confirm table names and schemas

## 📞 Support

For issues or questions:
1. Check error messages in browser console
2. Review component documentation
3. Check Supabase logs
4. Verify database schemas

## 📄 License

[Add your license info]

## 👥 Team

QCore Development Team - QA/QC Construction Management System

---

**Last Updated:** May 20, 2026  
**Version:** 1.0.0
