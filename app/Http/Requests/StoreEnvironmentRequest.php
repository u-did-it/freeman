<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreEnvironmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name'              => ['required', 'string', 'max:255'],
            'variables'         => ['nullable', 'array'],
            'variables.*.key'   => ['required', 'string', 'max:255'],
            'variables.*.value' => ['nullable', 'string'],
            'variables.*.enabled' => ['nullable', 'boolean'],
        ];
    }
}
