# QCore - QA/QC Construction Management System

## Project Structure

```
frontend/src/
├── pages/
│   ├── Dashboard.jsx              # Projects dashboard
│   ├── ProjectWorkspace.jsx       # NEW - Project workspace with module cards
│   ├── FieldReports.jsx           # NEW - Field reports table/list
│   ├── CreateFieldReport.jsx      # NEW - Create/edit field report form
│   ├── LabReports.jsx             # Updated - Lab reports table
│   └── ...
├── layouts/
│   └── MainLayout.jsx
├── components/
│   ├── Sidebar.jsx
│   ├── Navbar.jsx
│   └── ...
├── services/
│   └── supabase.js               # Supabase client
└── App.jsx                        # Updated with new routes
```

## Routes

### New Routes Added
- `/project/:projectId` - Project Workspace (shows Field Reports & Lab Reports cards)
- `/project/:projectId/field-reports` - View all field reports (table)
- `/project/:projectId/field-reports/create` - Create new field report (form)
- `/project/:projectId/lab-reports` - View all lab reports (table)
- `/project/:projectId/lab-reports/create` - Create new lab report (form)

### Existing Routes
- `/` - Dashboard (projects list)
- `/login` - Login page
- `/reports/:projectId` - Legacy reports (can be deprecated)
- `/lab-reports/:projectId` - Legacy lab reports (can be deprecated)

## Components Created

### 1. ProjectWorkspace.jsx
**Location:** `/project/:projectId`

**Features:**
- Project header with name, number, client, status
- Project details grid (location, dates, manager)
- Two professional module cards:
  - Field Reports card with icon, description, and action buttons
  - Lab Reports card with icon, description, and action buttons
- Sample project data (replace with Supabase fetch)

**Key Elements:**
- Gradient background design
- Professional spacing and shadows
- Responsive grid layout (1 column on mobile, 2 columns on desktop)
- Action buttons link to respective pages

### 2. FieldReports.jsx
**Location:** `/project/:projectId/field-reports`

**Features:**
- Professional table view of field reports
- Search by report number or inspector name
- Filter by status (All, Draft, Submitted, Rejected)
- Filter by date
- Columns: Report #, Date, Inspector, Weather, Status, Workers, Actions
- Action buttons: View, Export PDF
- Back button to ProjectWorkspace
- Create Field Report button

**Key Elements:**
- Sticky header
- Sortable columns (ready for implementation)
- Status badges with color coding
- Responsive table with horizontal scroll on mobile

### 3. CreateFieldReport.jsx
**Location:** `/project/:projectId/field-reports/create`

**Features:**
- Multi-section form with sidebar navigation
- 7 sections:
  1. **General Information** - Report number, date, weather, temperature, inspector
  2. **Manpower Details** - Workers count, subcontractor, supervisor
  3. **Equipment Used** - Equipment list and hours
  4. **Work Activities** - Activity description, location, progress %
  5. **QA/QC Observations** - Observations, issues, corrective actions
  6. **Safety Notes** - Incidents, PPE compliance, safety remarks
  7. **Attachments** - File upload for photos and documents

- Action buttons:
  - Save Draft (saves without submitting)
  - Submit Report (submits for review)
  - Export PDF (generates PDF)
  - Cancel (returns to list)

**Key Elements:**
- Tabbed navigation on left sidebar
- Auto-generated report numbers
- Status notifications (success, error, info)
- File attachment management with size display
- Responsive form layout
- Form validation ready (add as needed)

### 4. LabReports.jsx (Updated)
**Location:** `/project/:projectId/lab-reports`

**Features:**
- Professional table view of lab reports
- Columns: Report #, Date, Test Type, Specimen, Result, Status, Technician, Actions
- Test type icons (Compression, Compaction, Aggregate)
- Status badges with color coding
- Sample data for 3 lab reports
- Create Lab Report button
- Action buttons: View, Export PDF
- Back button to ProjectWorkspace

## Supabase Tables Required

### 1. projects (existing)
```sql
CREATE TABLE projects (
  id BIGINT PRIMARY KEY,
  project_name TEXT NOT NULL,
  project_number TEXT UNIQUE,
  client_name TEXT,
  client_representative TEXT,
  project_location TEXT,
  status TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### 2. field_reports (new)
```sql
CREATE TABLE field_reports (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  project_id BIGINT REFERENCES projects(id),
  report_number TEXT UNIQUE,
  report_date DATE NOT NULL,
  weather TEXT,
  temperature NUMERIC,
  inspector_name TEXT,
  workers_count INTEGER,
  subcontractor TEXT,
  supervisor TEXT,
  equipment_used TEXT,
  equipment_hours NUMERIC,
  activity_description TEXT,
  location TEXT,
  progress_percentage NUMERIC,
  observations TEXT,
  issues TEXT,
  corrective_actions TEXT,
  incidents TEXT,
  ppe_compliance TEXT,
  safety_remarks TEXT,
  status TEXT DEFAULT 'Draft',
  created_by TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

### 3. lab_reports (new)
```sql
CREATE TABLE lab_reports (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  project_id BIGINT REFERENCES projects(id),
  report_number TEXT UNIQUE,
  report_date DATE NOT NULL,
  test_type TEXT,
  specimen TEXT,
  result TEXT,
  status TEXT DEFAULT 'Pending',
  technician TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

### 4. field_report_attachments (new)
```sql
CREATE TABLE field_report_attachments (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  field_report_id BIGINT REFERENCES field_reports(id) ON DELETE CASCADE,
  file_name TEXT,
  file_path TEXT,
  file_type TEXT,
  file_size BIGINT,
  uploaded_by TEXT,
  created_at TIMESTAMP DEFAULT now()
);
```

## Integration Steps

### 1. Fetch Projects
Replace sample data in `ProjectWorkspace.jsx`:
```javascript
useEffect(() => {
  const fetchProjectDetails = async () => {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();
    setProject(data);
  };
  fetchProjectDetails();
}, [projectId]);
```

### 2. Fetch Field Reports
Replace sample data in `FieldReports.jsx`:
```javascript
useEffect(() => {
  const fetchReports = async () => {
    const { data } = await supabase
      .from('field_reports')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    setReports(data);
  };
  fetchReports();
}, [projectId]);
```

### 3. Create Field Report
In `CreateFieldReport.jsx`, replace `handleSubmit`:
```javascript
const handleSubmit = async () => {
  const { data, error } = await supabase
    .from('field_reports')
    .insert([{
      project_id: projectId,
      ...formData,
      created_by: session.user.email
    }])
    .select()
    .single();
  
  if (error) {
    setSubmitStatus({ type: 'error', message: error.message });
  } else {
    setSubmitStatus({ type: 'success', message: 'Report submitted!' });
    setTimeout(() => navigate(`/project/${projectId}/field-reports`), 2000);
  }
};
```

### 4. Upload Attachments
Add file upload handling:
```javascript
const handleFileUpload = async (files) => {
  for (const file of files) {
    const filePath = `field-reports/${projectId}/${file.name}`;
    const { data, error } = await supabase.storage
      .from('project-files')
      .upload(filePath, file);
    
    if (!error) {
      // Save attachment reference to database
      await supabase.from('field_report_attachments').insert({
        field_report_id: reportId,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size
      });
    }
  }
};
```

## Styling

- Uses **Tailwind CSS** (v3.4.19 already installed)
- Professional enterprise design with:
  - Gradient backgrounds (`from-gray-50 to-gray-100`)
  - Shadow depth effects (`shadow-md`, `shadow-lg`)
  - Color-coded status badges
  - Responsive breakpoints (mobile-first)
  - Hover effects and transitions

## Icons Used

All icons from **Lucide React** (v0.446.0 already installed):
- `FileText` - Field Reports
- `Beaker` - Lab Reports
- `ChevronRight`, `ChevronLeft` - Navigation
- `Plus` - Add/Create actions
- `Search`, `Filter` - Search and filter
- `Download` - Export
- `Eye` - View
- `MapPin`, `Calendar`, `User`, `Package` - Info cards
- `Users`, `Wrench`, `Shield`, `Paperclip` - Form sections
- And many more...

## Next Steps

1. **Connect Supabase**: Implement data fetching from Supabase tables
2. **Add Validation**: Add form validation in `CreateFieldReport.jsx`
3. **PDF Export**: Integrate PDF library (jsPDF or similar) for exports
4. **File Storage**: Set up Supabase Storage for document uploads
5. **Authentication**: Verify user session and permissions
6. **Search/Filter**: Implement backend search and filtering
7. **Notifications**: Add toast notifications for user feedback
8. **Mobile Testing**: Test responsive design on various devices
9. **Performance**: Add pagination for large report lists
10. **Analytics**: Track report submissions and project progress

## Development Server

```bash
npm run dev
```

Navigate to:
- Dashboard: http://localhost:5174/
- Project Workspace: http://localhost:5174/project/1
- Field Reports: http://localhost:5174/project/1/field-reports
- Create Field Report: http://localhost:5174/project/1/field-reports/create
- Lab Reports: http://localhost:5174/project/1/lab-reports

## Features Implemented

✅ Professional UI with enterprise design  
✅ Multi-page routing structure  
✅ Form with multiple sections and file uploads  
✅ Filter and search functionality  
✅ Status badges and icons  
✅ Responsive layout (mobile to desktop)  
✅ Sample data ready for real data integration  
✅ Professional spacing and shadows  
✅ Action buttons for common operations  
✅ Navigation breadcrumbs  

## Tips

- All components use sample data - replace with Supabase queries
- Report numbers can be auto-generated using Supabase sequences
- Status workflow: Draft → Submitted → Approved/Rejected
- Consider adding role-based access (Admin, QA Manager, Inspector)
- Add audit trail for report changes
- Implement revision history for field reports
