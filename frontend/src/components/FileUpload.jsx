import { useState } from 'react'
import { supabase } from '../services/supabase'

function FileUpload({ projectId }) {
  const [uploading, setUploading] = useState(false)

  async function handleUpload(event) {
    const file = event.target.files[0]

    if (!file) return

    setUploading(true)

    const fileName = `${Date.now()}-${file.name}`

    const { data, error } = await supabase.storage
      .from('reports')
      .upload(fileName, file)

    if (error) {
      alert('Upload failed')
      setUploading(false)
      return
    }

    const publicUrl = supabase.storage
      .from('reports')
      .getPublicUrl(fileName).data.publicUrl

    await supabase.from('reports').insert([
      {
        project_id: projectId,
        report_type: file.name,
        file_url: publicUrl,
        remarks: 'Uploaded from dashboard'
      }
    ])

    alert('Upload successful')

    setUploading(false)

    window.location.reload()
  }

 return (
  <div className="mb-8">
    <label className="border-2 border-dashed border-gray-300 rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 bg-white">
      
      <p className="text-lg font-semibold text-gray-700">
        Upload PDF Report
      </p>

      <p className="text-sm text-gray-500 mt-2">
        Click here to upload files
      </p>

      <input
        type="file"
        className="hidden"
        onChange={handleUpload}
      />
    </label>

    {uploading && (
      <p className="mt-4 text-blue-600 font-medium">
        Uploading file...
      </p>
    )}
  </div>
)
}

export default FileUpload