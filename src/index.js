import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const allowedOrigins = ['https://diuqbank.live', 'https://diuquestionbank.com'];

addEventListener('fetch', event => {
	event.respondWith(handleRequest(event));
});

async function handleRequest(event) {
	const request = event.request;
	const url = new URL(request.url);
	const pdfUrlPath = url.pathname.slice(1); // Remove leading slash

	const uploader = url.searchParams.get('uploader');

	let extra = "";
	if (uploader) {
		extra = " | uploader: " + uploader;
	}

	const cache = caches.default;
	let response = await cache.match(request);

	if (!response) {
		const pdfUrl = 'https://s3.diuquestionbank.com/' + decodeURIComponent(pdfUrlPath);

		try {
			const pdfResponse = await fetch(pdfUrl);

			const contentType = pdfResponse.headers.get('Content-Type');
			const fileName = pdfUrl.split('/').pop();

			if (contentType && contentType.toLowerCase().includes('application/pdf')) {
				const pdfBytes = await pdfResponse.arrayBuffer();
				const pdfDoc = await PDFDocument.load(pdfBytes);

				const pages = pdfDoc.getPages();
				const { width, height } = pages[0].getSize();

				// Add text to pages
				for (const page of pages) {
					page.drawText('For more questions:', {
						x: 10,
						y: height - 15,
						size: 12,
						color: rgb(0, 0, 0),
						font: await pdfDoc.embedFont(StandardFonts.Helvetica),
					});
					page.drawText('https://diuquestionbank.com' + extra, {
						x: 120,
						y: height - 15,
						size: 12,
						color: rgb(0, 0, 0),
						font: await pdfDoc.embedFont(StandardFonts.Helvetica),
					});
				}

				// Save PDF with compression
				const compressedPdfBytes = await pdfDoc.save({
					useObjectStreams: false,  // Important for enabling fast web view
					updateFieldAppearances: true,
					compress: true
				});

				response = new Response(compressedPdfBytes, {
					headers: {
						'Content-Type': 'application/pdf',
						'Content-Disposition': `inline; filename="${fileName}"`,
						'Cache-Control': 'public, max-age=86400', // 1 day client-side cache
						'Accept-Ranges': 'bytes', // Enable byte-range requests
					},
				});

				// Store the response in the cache
				event.waitUntil(cache.put(request, response.clone()));
			} else {
				response = new Response(pdfResponse.body, {
					status: pdfResponse.status,
					statusText: pdfResponse.statusText,
					headers: pdfResponse.headers,
				});
			}

			// Add CORS headers
			response.headers.set('Access-Control-Allow-Origin', '*');
			response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
			response.headers.set('Access-Control-Allow-Headers', 'Content-Type');

		} catch (error) {
			return new Response("Failed " + error, { status: 500 });
		}
	}

	// Handle byte-range requests for partial content
	if (request.headers.has('range')) {
		return handleRangeRequest(request, response);
	}

	return response;
}

function handleRangeRequest(request, originalResponse) {
	const range = request.headers.get('range');
	const total = originalResponse.headers.get('content-length');
	const parts = range.replace(/bytes=/, "").split("-");
	const start = parseInt(parts[0], 10);
	const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
	const chunk = originalResponse.body.slice(start, end + 1);

	return new Response(chunk, {
		status: 206,
		statusText: 'Partial Content',
		headers: {
			'Content-Range': `bytes ${start}-${end}/${total}`,
			'Accept-Ranges': 'bytes',
			'Content-Length': chunk.length,
			'Content-Type': 'application/pdf',
		}
	});
}
