import { useState } from "react";
import { useNavigate } from "react-router";
import { Upload, Video, ArrowLeft, FileVideo, CheckCircle, Link as LinkIcon } from "lucide-react";

export function UploadPage() {
  const navigate = useNavigate();
  const [uploadMethod, setUploadMethod] = useState<"file" | "link">("file");
  const [videoLink, setVideoLink] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileSelect = (file: File) => {
    if (file.type.startsWith("video/")) {
      setUploadedFile(file);
    } else {
      alert("동영상 파일만 업로드 가능합니다.");
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleUpload = () => {
    if (!uploadedFile && !videoLink) return;

    setIsUploading(true);
    setUploadProgress(0);

    // Simulate upload progress
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          // Navigate to processing page after upload
          setTimeout(() => {
            navigate("/processing/new");
          }, 500);
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/dashboard")}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-gray-700" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
                <Video className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">영상 업로드</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">영상 파일을 업로드하세요</h2>
            <p className="text-gray-600">AI가 자동으로 자막을 생성해드립니다</p>
          </div>

          <div className="flex justify-center gap-2 mb-6">
            <button
              onClick={() => setUploadMethod("file")}
              className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors ${
                uploadMethod === "file" 
                  ? "bg-emerald-600 text-white shadow-md" 
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              <Upload className="w-5 h-5 inline-block mr-2" />
              파일 업로드
            </button>
            <button
              onClick={() => setUploadMethod("link")}
              className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors ${
                uploadMethod === "link" 
                  ? "bg-emerald-600 text-white shadow-md" 
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              <LinkIcon className="w-5 h-5 inline-block mr-2" />
              링크 입력
            </button>
          </div>

          {uploadMethod === "file" ? (
            !uploadedFile ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${
                  isDragging
                    ? "border-emerald-600 bg-emerald-50"
                    : "border-gray-300 hover:border-emerald-400"
                }`}
              >
                <Upload
                  className={`w-16 h-16 mx-auto mb-4 ${
                    isDragging ? "text-emerald-600" : "text-gray-400"
                  }`}
                />
                <h3 className="text-xl font-medium text-gray-900 mb-2">
                  파일을 드래그하여 업로드하세요
                </h3>
                <p className="text-gray-600 mb-6">또는 클릭하여 파일을 선택하세요</p>
                <label className="inline-block px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer">
                  파일 선택
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </label>
                <p className="text-sm text-gray-500 mt-4">
                  지원 형식: MP4, AVI, MOV, MKV (최대 2GB)
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* File Info */}
                <div className="bg-gray-50 rounded-xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileVideo className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 mb-1 truncate">
                        {uploadedFile.name}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {formatFileSize(uploadedFile.size)} • {uploadedFile.type}
                      </p>
                    </div>
                    {uploadProgress === 100 && (
                      <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                    )}
                  </div>

                  {/* Upload Progress */}
                  {isUploading && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">업로드 중...</span>
                        <span className="text-sm font-medium text-emerald-600">{uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4">
                  <button
                    onClick={() => setUploadedFile(null)}
                    disabled={isUploading}
                    className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    다른 파일 선택
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={isUploading}
                    className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUploading ? "업로드 중..." : "자막 생성 시작"}
                  </button>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-6">
              {/* Link Input */}
              <div className="bg-gray-50 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <LinkIcon className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={videoLink}
                      onChange={(e) => setVideoLink(e.target.value)}
                      placeholder="동영상 링크를 입력하세요"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  {uploadProgress === 100 && (
                    <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                  )}
                </div>

                {/* Upload Progress */}
                {isUploading && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">업로드 중...</span>
                      <span className="text-sm font-medium text-emerald-600">{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4">
                <button
                  onClick={() => setVideoLink("")}
                  disabled={isUploading}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  다른 링크 입력
                </button>
                <button
                  onClick={handleUpload}
                  disabled={isUploading}
                  className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? "업로드 중..." : "자막 생성 시작"}
                </button>
              </div>
            </div>
          )}

          {/* Info */}
          <div className="mt-8 pt-8 border-t border-gray-200">
            <h3 className="font-medium text-gray-900 mb-3">업로드 후 진행 과정</h3>
            <ol className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="font-medium text-emerald-600">1.</span>
                영상 파일이 서버에 업로드됩니다
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-emerald-600">2.</span>
                AI가 음성을 분석하여 자막을 생성합니다
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-emerald-600">3.</span>
                자막 편집 화면으로 이동하여 자막을 수정할 수 있습니다
              </li>
            </ol>
          </div>
        </div>
      </main>
    </div>
  );
}