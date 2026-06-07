from providers.openrouter_nano_banana import (
    OpenRouterNanoBananaClient,
    describe_empty_image_response,
)


def test_extract_data_urls_from_message_images() -> None:
    payload = {
        'choices': [
            {
                'message': {
                    'content': 'Generated icon',
                    'images': [
                        {
                            'type': 'image_url',
                            'image_url': {'url': 'data:image/png;base64,abc123'},
                        }
                    ],
                }
            }
        ]
    }
    assert OpenRouterNanoBananaClient._extract_data_urls(payload) == ['data:image/png;base64,abc123']


def test_extract_data_urls_from_inline_data_and_http() -> None:
    payload = {
        'choices': [
            {
                'message': {
                    'content': [
                        {
                            'type': 'image',
                            'inline_data': {'mime_type': 'image/png', 'data': 'inline123'},
                        },
                        {
                            'type': 'image_url',
                            'image_url': {'url': 'https://cdn.example.com/icon.png'},
                        },
                    ],
                }
            }
        ]
    }
    urls = OpenRouterNanoBananaClient._extract_data_urls(payload)
    assert 'data:image/png;base64,inline123' in urls
    assert 'https://cdn.example.com/icon.png' in urls


def test_describe_empty_image_response_includes_assistant_text() -> None:
    payload = {
        'choices': [
            {
                'finish_reason': 'stop',
                'message': {'content': 'I cannot generate that image.'},
            }
        ]
    }
    detail = describe_empty_image_response(payload)
    assert 'finish_reason=stop' in detail
    assert 'I cannot generate that image.' in detail
