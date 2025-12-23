import { ResponseHandler, ResponseHandlerOptions } from "./response-handler";
import { StreamingResponseHandler } from "./streaming-response-handler";
import { NonStreamingResponseHandler } from "./non-streaming-response-handler";

export class ResponseHandlerFactory {
	static create(
		streaming: boolean,
		options: ResponseHandlerOptions
	): ResponseHandler {
		return streaming
			? new StreamingResponseHandler(options)
			: new NonStreamingResponseHandler(options);
	}
}