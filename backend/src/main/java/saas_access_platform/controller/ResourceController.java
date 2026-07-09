package saas_access_platform.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import saas_access_platform.dto.request.CreateResourceRequest;
import saas_access_platform.dto.request.UpdateResourceRequest;
import saas_access_platform.entity.Resource;
import saas_access_platform.service.ResourceService;

import java.util.List;

@RestController
@RequestMapping("/api/resources")
@RequiredArgsConstructor
public class ResourceController {

    private final ResourceService resourceService;

    @PostMapping
    @PreAuthorize("hasPermission(null, 'RESOURCE_CREATE')")
    public ResponseEntity<Resource> createResource(
            @Valid @RequestBody CreateResourceRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(resourceService.createResource(request));
    }

    @GetMapping
    @PreAuthorize("hasPermission(null, 'RESOURCE_READ') or hasPermission(null, 'RESOURCE_UPDATE') or hasPermission(null, 'RESOURCE_DELETE') or hasPermission(null, 'RESOURCE_CREATE')")
    public ResponseEntity<Page<Resource>> getAllResources(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(resourceService.getAllResources(page, size));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasPermission(null, 'RESOURCE_READ')")
    public ResponseEntity<Resource> getResourceById(@PathVariable Long id) {
        return ResponseEntity.ok(resourceService.getResourceById(id));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasPermission(null, 'RESOURCE_UPDATE')")
    public ResponseEntity<Resource> updateResource(
            @PathVariable Long id,
            @Valid @RequestBody UpdateResourceRequest request) {
        return ResponseEntity.ok(resourceService.updateResource(id, request));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasPermission(null, 'RESOURCE_DELETE')")
    public ResponseEntity<Void> deleteResource(@PathVariable Long id) {
        resourceService.deleteResource(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/search")
    @PreAuthorize("hasPermission(null, 'RESOURCE_READ')")
    public ResponseEntity<List<Resource>> searchByName(
            @RequestParam String name) {
        return ResponseEntity.ok(resourceService.searchByName(name));
    }
}