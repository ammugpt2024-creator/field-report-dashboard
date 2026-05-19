import { useState } from "react";
import { supabase } from "../services/supabase";

function FileUpload({ projectId }) {

  const [uploading, setUploading] =
    useState(false);

  async function handleUpload(event) {

    try {

      const file = event.target.files[0];

      if (!file) return;

      setUploading(true);

      // UNIQUE FILE NAME

      const fileName =
        `${Date.now()}-${file.name}`;

      // UPLOAD TO STORAGE

      const { error: uploadError } =
        await supabase.storage
          .from("reports")
          .upload(fileName, file);

      if (uploadError) {

        console.log(uploadError);

        alert("Upload failed");

        setUploading(false);

        return;
      }

      // GET PUBLIC URL

      const {
        data: { publicUrl }
      } = supabase.storage
        .from("reports")
        .getPublicUrl(fileName);

      // DETECT REPORT TYPE

      let reportType = "field";

      if (
        file.name
          .toLowerCase()
          .includes("lab")
      ) {

        reportType = "lab";
      }

      // INSERT INTO DATABASE

      const { error: dbError } =
        await supabase
          .from("reports")
          .insert([
            {
              project_id: projectId,

              name: file.name,

              url: publicUrl,

              type: reportType,

              remarks:
                "Uploaded from dashboard"
            }
          ]);

      if (dbError) {

        console.log(dbError);

        alert(
          "Database insert failed"
        );

        setUploading(false);

        return;
      }

      alert("Upload successful");

      window.location.reload();

    } catch (err) {

      console.log(
        "Unexpected error:",
        err
      );

      alert("Something went wrong");

    } finally {

      setUploading(false);
    }
  }

  return (

    <div className="mb-8">

      <label
        className="
          border-2
          border-dashed
          border-gray-300
          rounded-2xl
          p-10
          flex
          flex-col
          items-center
          justify-center
          cursor-pointer
          hover:border-blue-500
          hover:bg-blue-50
          transition
          bg-white
        "
      >

        <div className="text-5xl mb-4">
          📄
        </div>

        <p
          className="
            text-xl
            font-semibold
            text-gray-700
          "
        >
          Upload PDF Report
        </p>

        <p
          className="
            text-sm
            text-gray-500
            mt-2
          "
        >
          Click here to upload files
        </p>

        <input
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleUpload}
        />

      </label>

      {uploading && (

        <p
          className="
            mt-4
            text-blue-600
            font-medium
          "
        >
          Uploading file...
        </p>

      )}

    </div>
  );
}

export default FileUpload;