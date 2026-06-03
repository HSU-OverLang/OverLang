import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Upload,
  FileVideo,
  CheckCircle,
  Link as LinkIcon,
  Globe,
  Loader2,
} from "lucide-react";
import { uploadVideoFile, createProject, createJob } from "@/api/video";
import { Header } from "@/components/layout/Header";

const LANGUAGES = [
  { code: "KO", label: "한국어" },
  { code: "EN", label: "영어" },
  { code: "ZH", label: "중국어" },
  { code: "JA", label: "일본어" },
  { code: "ES", label: "스페인어" },
  { code: "FR", label: "프랑스어" },
] as const;

type LanguageCode = (typeof LANGUAGES)[number]["code"];

export function UploadPage() {
  const navigate = useNavigate();

  // 입력 상태
  const [title, setTitle] = useState("");
  const [uploadMethod, setUploadMethod] = useState<"file" | "link">("file");
  const [videoLink, setVideoLink] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState<LanguageCode>("EN");
  const [targetLanguage, setTargetLanguage] = useState<LanguageCode>("KO");

  // 업로드 진행 상태
  const [uploadPhase, setUploadPhase] = useState<"idle" | "uploading" | "error">("idle");
  const [uploadStep, setUploadStep] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ── 파일 선택 핸들러 ────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files[0]);
  };
  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("video/")) {
      alert("동영상 파일만 업로드 가능합니다.");
      return;
    }
    setUploadedFile(file);
    // 오류 상태 초기화
    if (uploadPhase === "error") {
      setUploadPhase("idle");
      setUploadError(null);
      setUploadStep("");
    }
    // 제목이 비어있으면 파일명(확장자 제외)으로 자동 채움
    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^/.]+$/, ""));
    }
  };
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
  };

  // ── 제출 가능 여부 ──────────────────────────────────────
  const canSubmit =
    title.trim().length > 0 &&
    (uploadMethod === "file" ? uploadedFile !== null : videoLink.trim().length > 0);

  const isDisabled = uploadPhase === "uploading";

  // ── 업로드 → 프로젝트 생성 → Job 생성 ──────────────────
  const handleUpload = async () => {
    if (!canSubmit) return;

    setUploadPhase("uploading");
    setUploadError(null);

    try {
      if (uploadMethod === "file" && uploadedFile) {
        let fileResult;
        try {
          setUploadStep("영상을 서버에 업로드하는 중... (1/3)");
          fileResult = await uploadVideoFile(uploadedFile);
        } catch (err) {
          console.error("[OverLang] 파일 업로드 실패:", err);
          throw new Error("영상 파일 업로드에 실패했습니다. 파일 크기(최대 2GB)와 형식을 확인하고 다시 시도해주세요.");
        }

        let project;
        try {
          setUploadStep("프로젝트를 생성하는 중... (2/3)");
          project = await createProject({
            title: title.trim(),
            sourceType: "UPLOAD",
            fileUrl: fileResult.fileUrl,
            fileKey: fileResult.fileKey,
          });
        } catch (err) {
          console.error("[OverLang] 프로젝트 생성 실패:", err);
          throw new Error("프로젝트 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
        }

        let job;
        try {
          setUploadStep("AI 분석 작업을 등록하는 중... (3/3)");
          job = await createJob(project.projectId!, sourceLanguage, targetLanguage);
        } catch (err) {
          console.error("[OverLang] AI Job 생성 실패:", err);
          throw new Error("AI 분석 시작에 실패했습니다. 잠시 후 다시 시도해주세요.");
        }

        navigate("/processing", {
          state: { jobId: job.jobId, projectId: project.projectId, targetLanguage },
        });
      } else {
        let project;
        try {
          setUploadStep("프로젝트를 생성하는 중... (1/2)");
          project = await createProject({
            title: title.trim(),
            sourceType: "YOUTUBE",
            sourceUrl: videoLink.trim(),
          });
        } catch (err) {
          console.error("[OverLang] 프로젝트 생성 실패:", err);
          throw new Error("프로젝트 생성에 실패했습니다. YouTube 링크가 올바른지 확인하고 다시 시도해주세요.");
        }

        let job;
        try {
          setUploadStep("AI 분석 작업을 등록하는 중... (2/2)");
          job = await createJob(project.projectId!, sourceLanguage, targetLanguage);
        } catch (err) {
          console.error("[OverLang] AI Job 생성 실패:", err);
          throw new Error("AI 분석 시작에 실패했습니다. 잠시 후 다시 시도해주세요.");
        }

        navigate("/processing", {
          state: {
            jobId: job.jobId,
            projectId: project.projectId ?? project.id,
            videoSrc: videoLink.trim(),
            targetLanguage,
          },
        });
      }
    } catch (err) {
      setUploadPhase("error");
      setUploadError(
        err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
      );
    }
  };

  const handleRetry = () => {
    setUploadPhase("idle");
    setUploadError(null);
    setUploadStep("");
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      {/* 본문 */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">

        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">영상 파일을 업로드하세요.</h2>
            <p className="text-gray-600">AI가 자동으로 자막을 생성해드립니다.</p>
          </div>

          {/* 프로젝트 제목 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              프로젝트 제목 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="영상의 제목을 입력하세요."
              disabled={isDisabled}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* 업로드 방식 탭 */}
          <div className="flex justify-center gap-2 mb-6">
            <button
              onClick={() => setUploadMethod("file")}
              disabled={isDisabled}
              className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
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
              disabled={isDisabled}
              className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                uploadMethod === "link"
                  ? "bg-emerald-600 text-white shadow-md"
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              <LinkIcon className="w-5 h-5 inline-block mr-2" />
              링크 입력
            </button>
          </div>

          {/* 파일 / 링크 영역 */}
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
                  파일을 드래그하여 업로드하세요.
                </h3>
                <p className="text-gray-600 mb-6">또는 클릭하여 파일을 선택하세요.</p>
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
                  <CheckCircle className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                </div>
                <button
                  onClick={() => setUploadedFile(null)}
                  disabled={isDisabled}
                  className="mt-4 text-sm text-gray-500 hover:text-gray-700 underline disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  다른 파일 선택
                </button>
              </div>
            )
          ) : (
            <div className="bg-gray-50 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <LinkIcon className="w-6 h-6 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={videoLink}
                    onChange={(e) => {
                      setVideoLink(e.target.value);
                      if (uploadPhase === "error") {
                        setUploadPhase("idle");
                        setUploadError(null);
                        setUploadStep("");
                      }
                    }}
                    placeholder="YouTube 링크를 입력하세요. (예: https://youtube.com/watch?v=...)"
                    disabled={isDisabled}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 언어 선택 */}
          <div className="mt-8 pt-8 border-t border-gray-200 space-y-6">
            {/* 영상 언어 */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Globe className="w-5 h-5 text-emerald-600" />
                <h3 className="font-medium text-gray-900">영상 언어 <span className="text-sm text-gray-400">(원본)</span></h3>
              </div>
              <div className="flex flex-wrap gap-3">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => setSourceLanguage(lang.code)}
                    disabled={isDisabled}
                    className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      sourceLanguage === lang.code
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 번역 언어 */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Globe className="w-5 h-5 text-violet-500" />
                <h3 className="font-medium text-gray-900">번역 언어 <span className="text-sm text-gray-400">(출력)</span></h3>
              </div>
              <div className="flex flex-wrap gap-3">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => setTargetLanguage(lang.code)}
                    disabled={isDisabled}
                    className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      targetLanguage === lang.code
                        ? "bg-violet-600 text-white shadow-sm"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 업로드 액션 영역 */}
          <div className="mt-8">
            {uploadPhase === "idle" && (
              <button
                onClick={handleUpload}
                disabled={!canSubmit}
                className="w-full px-6 py-4 bg-emerald-600 text-white rounded-xl font-semibold text-base hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                자막 생성 시작
              </button>
            )}

            {uploadPhase === "uploading" && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-5 flex items-center gap-4">
                <Loader2 className="w-6 h-6 text-emerald-600 animate-spin shrink-0" />
                <div>
                  <p className="font-medium text-emerald-800">{uploadStep}</p>
                  <p className="text-sm text-emerald-600 mt-0.5">잠시만 기다려주세요...</p>
                </div>
              </div>
            )}

            {uploadPhase === "error" && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-5">
                <div className="flex items-start gap-3 mb-5">
                  <div className="w-6 h-6 rounded-full bg-red-200 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-red-600 text-xs font-bold">!</span>
                  </div>
                  <div>
                    <p className="font-semibold text-red-800">업로드 실패</p>
                    <p className="text-sm text-red-600 mt-0.5">{uploadError}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleUpload}
                    className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                  >
                    재시도
                  </button>
                  <button
                    onClick={handleRetry}
                    className="flex-1 px-4 py-2.5 border border-red-300 text-red-700 rounded-lg font-medium hover:bg-red-100 transition-colors"
                  >
                    처음부터
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 안내 */}
          <div className="mt-8 pt-8 border-t border-gray-200">
            <h3 className="font-medium text-gray-900 mb-3">업로드 후 진행 과정</h3>
            <ol className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="font-medium text-emerald-600">1.</span>
                영상 파일이 서버에 업로드됩니다.
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-emerald-600">2.</span>
                AI가 음성 인식(STT)과 화면 텍스트(OCR)를 분석합니다.
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-emerald-600">3.</span>
                분석이 완료되면 자막 편집 화면으로 자동 이동합니다.
              </li>
            </ol>
          </div>
        </div>
      </main>
      <footer className="py-4 text-center">
        <p className="text-xs text-slate-300">© 2026 OverLang. All rights reserved.</p>
      </footer>
    </div>
  );
}
