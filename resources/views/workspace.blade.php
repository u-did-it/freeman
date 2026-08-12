@extends('layouts.app')

@section('title', 'Workspace')

@section('content')
<div x-data="workspaceShell()"
     class="h-screen flex flex-col overflow-hidden"
     style="background:var(--color-bg-base); color:var(--color-text-primary); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">

    @include('workspace.topbar')

    <div class="flex flex-1 overflow-hidden" style="min-height:0">

        @include('workspace.sidebar')

        <main class="flex-1 flex flex-col overflow-hidden" style="min-width:0; background:var(--color-bg-base);">

            {{-- Tab bar (always visible when there are tabs) --}}
            <div x-show="tabs.length > 0"
                 class="flex items-center flex-shrink-0 overflow-x-auto"
                 style="background:var(--color-bg-surface); border-bottom:1px solid var(--color-border-subtle); scrollbar-width:none; min-height:38px;">

                <template x-for="tab in tabs" :key="tab.id">
                    <div @click="switchTab(tab.id)"
                         @contextmenu.prevent="openTabContextMenu($event, tab.id)"
                         class="flex items-center gap-2 px-3 py-2 flex-shrink-0 cursor-pointer select-none group relative"
                         :style="activeTabId === tab.id
                             ? 'background:var(--color-bg-base); border-bottom:2px solid var(--color-brand); color:#fff;'
                             : 'border-bottom:2px solid transparent; color:var(--color-text-muted-4);'"
                         style="border-right:1px solid var(--color-border-subtle); max-width:200px; min-width:130px;">

                        {{-- Method badge --}}
                        <span class="text-[9px] font-bold font-mono flex-shrink-0"
                              :class="methodColor(tab.request.method)"
                              x-text="tab.request.method"></span>

                        {{-- Request name --}}
                        <span class="text-xs truncate flex-1 min-w-0" x-text="tab.request.name"></span>

                        {{-- Dirty dot --}}
                        <span x-show="tab.isDirty"
                              class="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style="background:var(--color-brand);"></span>

                        {{-- Close button --}}
                        <button @click.stop="closeTab(tab.id)"
                                class="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                style="color:var(--color-text-muted-4);"
                                onmouseover="this.style.color='#fff'; this.style.background='rgba(255,255,255,0.1)'"
                                onmouseout="this.style.color='var(--color-text-muted-4)'; this.style.background='transparent'">
                            <svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                </template>

                {{-- New tab button --}}
                <button @click="newTab()"
                        class="flex items-center justify-center w-8 h-8 flex-shrink-0 ml-1 rounded transition-colors"
                        style="color:var(--color-text-muted-4);"
                        title="New request tab"
                        onmouseover="this.style.color='var(--color-text-muted-1)'" onmouseout="this.style.color='var(--color-text-muted-4)'">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
                    </svg>
                </button>

                {{-- Tab context menu --}}
                <div x-show="contextMenu.open"
                     x-cloak
                     @click.outside="closeTabContextMenu()"
                     @contextmenu.prevent
                     class="fixed rounded shadow-2xl z-50 py-1 w-44 text-xs"
                     :style="`top:${contextMenu.y}px; left:${contextMenu.x}px; background:var(--color-bg-elevated); border:1px solid var(--color-border-menu);`">

                    <button @click="closeTab(contextMenu.tabId); closeTabContextMenu()"
                            class="w-full text-left px-3 py-2 transition-colors" style="color:var(--color-text-primary);"
                            onmouseover="this.style.background='var(--color-bg-btn)'" onmouseout="this.style.background='transparent'">
                        Close
                    </button>
                    <button @click="closeOtherTabs(contextMenu.tabId)"
                            :disabled="tabs.length <= 1"
                            :class="tabs.length <= 1 ? 'opacity-40 cursor-default' : ''"
                            class="w-full text-left px-3 py-2 transition-colors" style="color:var(--color-text-primary);"
                            onmouseover="this.style.background='var(--color-bg-btn)'" onmouseout="this.style.background='transparent'">
                        Close Others
                    </button>
                    <button @click="closeTabsToRight(contextMenu.tabId)"
                            :disabled="tabs.findIndex(t => t.id === contextMenu.tabId) >= tabs.length - 1"
                            :class="tabs.findIndex(t => t.id === contextMenu.tabId) >= tabs.length - 1 ? 'opacity-40 cursor-default' : ''"
                            class="w-full text-left px-3 py-2 transition-colors" style="color:var(--color-text-primary);"
                            onmouseover="this.style.background='var(--color-bg-btn)'" onmouseout="this.style.background='transparent'">
                        Close to the Right
                    </button>
                    <button @click="closeTabsToLeft(contextMenu.tabId)"
                            :disabled="tabs.findIndex(t => t.id === contextMenu.tabId) <= 0"
                            :class="tabs.findIndex(t => t.id === contextMenu.tabId) <= 0 ? 'opacity-40 cursor-default' : ''"
                            class="w-full text-left px-3 py-2 transition-colors" style="color:var(--color-text-primary);"
                            onmouseover="this.style.background='var(--color-bg-btn)'" onmouseout="this.style.background='transparent'">
                        Close to the Left
                    </button>
                    <div class="my-1" style="border-top:1px solid var(--color-border-subtle);"></div>
                    <button @click="closeAllTabs()"
                            class="w-full text-left px-3 py-2 transition-colors" style="color:var(--color-text-primary);"
                            onmouseover="this.style.background='var(--color-bg-btn)'" onmouseout="this.style.background='transparent'">
                        Close All
                    </button>
                </div>
            </div>

            @include('workspace.welcome')

            {{-- Request builder wrapper — owns requestBuilderComponent scope --}}
            <div x-data="requestBuilderComponent()"
                 x-show="activeTab !== null"
                 class="flex-1 flex flex-col overflow-hidden"
                 style="min-height:0">
                @include('workspace.request-builder')
            </div>

        </main>
    </div>

    @include('workspace.collection-variables-modal')
    @include('workspace.save-request-modal')

    @include('workspace.styles')

</div>
@endsection
