package saas_access_platform.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import saas_access_platform.dto.request.CreateResourceRequest;
import saas_access_platform.dto.request.UpdateResourceRequest;
import saas_access_platform.entity.Resource;
import saas_access_platform.exception.ResourceNotFoundException;
import saas_access_platform.repository.ResourceRepository;
import saas_access_platform.security.CurrentUserContext;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ResourceService {

    private final ResourceRepository resourceRepository;

    private CurrentUserContext getCurrentUser() {
        return (CurrentUserContext) SecurityContextHolder
                .getContext()
                .getAuthentication()
                .getPrincipal();
    }

    public Resource createResource(CreateResourceRequest request) {
        CurrentUserContext currentUser = getCurrentUser();

        Resource resource = Resource.builder()
                .name(request.getName())
                .description(request.getDescription())
                .orgId(currentUser.getOrgId())
                .ownerUserId(currentUser.getUserId())
                .build();

        return resourceRepository.save(resource);
    }

    public List<Resource> getAllResources() {   // can be removed later
        CurrentUserContext currentUser = getCurrentUser();
        return resourceRepository.findAllByOrgId(currentUser.getOrgId());
    }

    public Page<Resource> getAllResources(int page, int size) {
        CurrentUserContext currentUser = getCurrentUser();
        Pageable pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());
        return resourceRepository.findAllByOrgId(currentUser.getOrgId(), pageable);
    }

    public Resource getResourceById(Long id) {
        CurrentUserContext currentUser = getCurrentUser();

        return resourceRepository.findByIdAndOrgId(id, currentUser.getOrgId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Resource not found with id: " + id));
    }

    public Resource updateResource(Long id, UpdateResourceRequest request) {
        Resource resource = getResourceById(id);
        resource.setName(request.getName());
        resource.setDescription(request.getDescription());
        return resourceRepository.save(resource);
    }

    public void deleteResource(Long id) {
        Resource resource = getResourceById(id);
        resourceRepository.delete(resource);
    }

    public List<Resource> searchByName(String name) {
        CurrentUserContext currentUser = getCurrentUser();
        return resourceRepository.findAllByOrgId(currentUser.getOrgId())
                .stream()
                .filter(r -> r.getName().toLowerCase()
                        .contains(name.toLowerCase()))
                .toList();
    }
}