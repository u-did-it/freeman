<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RunRequestRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'method'         => ['required', Rule::in(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])],
            'url'            => ['required', 'string', 'max:2048'],
            'request_id'     => ['nullable', 'integer'],
            'environment_id' => ['nullable', 'integer'],
            'headers'           => ['nullable'],   // array from JSON; JSON string when sent as FormData
            'headers.*.key'     => ['nullable', 'string', 'max:255'],
            'headers.*.value'   => ['nullable', 'string', 'max:8192'],
            'headers.*.enabled' => ['nullable', 'boolean'],
            'body_type'         => ['nullable', Rule::in(['none', 'raw', 'form-data', 'x-www-form-urlencoded'])],
            'body'              => ['nullable', 'string'],
            'body_form'             => ['nullable', 'array'],
            'body_form.*.key'       => ['nullable', 'string', 'max:255'],
            'body_form.*.value'     => ['nullable', 'string', 'max:10000'],
            'body_form.*.type'      => ['nullable', Rule::in(['text', 'file'])],
            'auth_type'         => ['nullable', Rule::in(['none', 'bearer', 'basic', 'api_key'])],
            'auth_data'         => ['nullable'],  // array from JSON; JSON string when sent as FormData
        ];
    }
}
