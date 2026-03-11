import html2canvas from "html2canvas";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";

const REPORT_ID = "mindlab-report-root";
type CaptureHooks = {
  beforeCapture?: () => Promise<void> | void;
  afterCapture?: () => Promise<void> | void;
};

async function getImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  const img = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image_load_failed"));
  });
  img.src = dataUrl;
  await loaded;
  return { width: img.width, height: img.height };
}

function savePdfFromImageData(dataUrl: string, imageWidth: number, imageHeight: number, period: { start: string; end: string }): void {
  const pdfWidth = 210;
  const pdfHeight = Math.round((imageHeight / imageWidth) * pdfWidth);
  const pageHeight = 297;
  const totalPages = Math.ceil(pdfHeight / pageHeight);

  const pdf = new jsPDF({
    orientation: pdfHeight > pdfWidth ? "portrait" : "landscape",
    unit: "mm",
    format: "a4",
  });

  for (let i = 0; i < totalPages; i += 1) {
    if (i > 0) {
      pdf.addPage();
    }
    pdf.addImage(dataUrl, "PNG", 0, -(i * pageHeight), pdfWidth, pdfHeight);
  }

  const filename = `MindLab_Report_${period.start.replace(/-/g, "")}_${period.end.replace(/-/g, "")}.pdf`;
  pdf.save(filename);
}

export async function exportReportPNG(period: {
  start: string;
  end: string;
}, hooks?: CaptureHooks): Promise<void> {
  if (hooks?.beforeCapture) {
    await hooks.beforeCapture();
  }
  const element = document.getElementById(REPORT_ID);
  try {
    if (!element) {
      throw new Error("리포트 요소를 찾을 수 없습니다");
    }

    const dataUrl = await toPng(element, {
      backgroundColor: "#ffffff",
      pixelRatio: 2,
      cacheBust: true,
    });

    const filename = `MindLab_Report_${period.start.replace(/-/g, "")}_${period.end.replace(/-/g, "")}.png`;

    const link = document.createElement("a");
    link.download = filename;
    link.href = dataUrl;
    link.click();
  } finally {
    if (hooks?.afterCapture) {
      await hooks.afterCapture();
    }
  }
}

export async function exportReportPDF(period: {
  start: string;
  end: string;
}, hooks?: CaptureHooks): Promise<void> {
  if (hooks?.beforeCapture) {
    await hooks.beforeCapture();
  }
  const element = document.getElementById(REPORT_ID);
  try {
    if (!element) {
      throw new Error("리포트 요소를 찾을 수 없습니다");
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    try {
      const canvas = await html2canvas(element, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
      });
      const imgData = canvas.toDataURL("image/png");
      savePdfFromImageData(imgData, canvas.width, canvas.height, period);
    } catch {
      // html2canvas가 환경에 따라 실패할 수 있어 PNG 렌더 경로로 폴백
      const dataUrl = await toPng(element, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        cacheBust: true,
      });
      const size = await getImageSize(dataUrl);
      savePdfFromImageData(dataUrl, size.width, size.height, period);
    }
  } finally {
    if (hooks?.afterCapture) {
      await hooks.afterCapture();
    }
  }
}
