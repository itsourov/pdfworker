import { PDFDocument, rgb } from 'pdf-lib';

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

				for (const page of pages) {
					page.drawText('For more questions:', {
						x: 10,
						y: height - 15,
						size: 12,
						color: rgb(0, 0, 0),
					});
					page.drawText('https://diuquestionbank.com' + extra, {
						x: 120,
						y: height - 15,
						size: 12,
						color: rgb(0, 0, 0),
					});
				}

				const pdfBytesModified = await pdfDoc.save();

				response = new Response(pdfBytesModified, {
					headers: {
						'Content-Type': 'application/pdf',
						'Content-Disposition': `inline; filename="${fileName}"`,
						'Cache-Control': 'public, max-age=86400', // 1 day client-side cache
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
			// const origin = request.headers.get('Origin');
			// if (allowedOrigins.includes(origin)) {
			// 	response.headers.set('Access-Control-Allow-Origin', origin);
			// }
			response.headers.set('Access-Control-Allow-Origin', '*');

			response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
			response.headers.set('Access-Control-Allow-Headers', 'Content-Type');

		} catch (error) {
			return new Response("Failed " + error, { status: 500 });
		}
	}

	return response;
}
