<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreRequestRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name'          => ['required', 'string', 'max:255'],
            'method'        => ['required', Rule::in(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])],
            'url'           => ['nullable', 'string', 'max:2048'],
            'collection_id' => ['nullable', 'integer', 'exists:collections,id'],
            'folder_id'     => ['nullable', 'integer', 'exists:collection_folders,id'],
            'headers'       => ['nullable', 'array'],
            'headers.*.key'     => ['nullable', 'string', 'max:255'],
            'headers.*.value'   => ['nullable', 'string', 'max:8192'],
            'headers.*.enabled' => ['nullable', 'boolean'],
            'params'            => ['nullable', 'array'],
            'params.*.key'      => ['nullable', 'string', 'max:255'],
            'params.*.value'    => ['nullable', 'string', 'max:8192'],
            'params.*.enabled'  => ['nullable', 'boolean'],
            'body_type'     => ['nullable', Rule::in(['none', 'raw', 'form-data', 'x-www-form-urlencoded'])],
            'raw_body_type' => ['nullable', Rule::in(['text', 'json', 'javascript', 'xml', 'html'])],
            'body'          => ['nullable', 'string'],
            'body_form'             => ['nullable', 'array'],
            'body_form.*.key'       => ['nullable', 'string', 'max:255'],
            'body_form.*.value'     => ['nullable', 'string', 'max:10000'],
            'body_form.*.enabled'   => ['nullable', 'boolean'],
            'body_form.*.type'      => ['nullable', Rule::in(['text', 'file'])],
            'auth_type'     => ['nullable', Rule::in(['none', 'bearer', 'basic', 'api_key'])],
            'auth_data'     => ['nullable', 'array'],
        ];
    }
}
