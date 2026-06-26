package saas_access_platform.service;

import lombok.RequiredArgsConstructor;
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
                .orgId(currentUser.getOrgId())
                .ownerUserId(currentUser.getUserId())
                .build();

        return resourceRepository.save(resource);
    }

    public List<Resource> getAllResources() {
        CurrentUserContext currentUser = getCurrentUser();
        return resourceRepository.findAllByOrgId(currentUser.getOrgId());
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