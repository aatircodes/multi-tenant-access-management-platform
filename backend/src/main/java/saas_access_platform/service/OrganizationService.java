package saas_access_platform.service;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import saas_access_platform.dto.response.OrganizationResponse;
import saas_access_platform.entity.Organization;
import saas_access_platform.exception.ResourceNotFoundException;
import saas_access_platform.repository.OrganizationRepository;
import saas_access_platform.security.CurrentUserContext;

@Service
@RequiredArgsConstructor
public class OrganizationService {

    private final OrganizationRepository organizationRepository;

    public OrganizationResponse getCurrentOrganization() {
        CurrentUserContext currentUser = (CurrentUserContext) SecurityContextHolder
                .getContext()
                .getAuthentication()
                .getPrincipal();

        Organization org = organizationRepository.findById(currentUser.getOrgId())
                .orElseThrow(() -> new ResourceNotFoundException("Organization not found"));

        return OrganizationResponse.builder()
                .name(org.getName())
                .slug(org.getSlug())
                .requestLimitPerMinute(org.getRequestLimitPerMinute())
                .createdAt(org.getCreatedAt())
                .build();
    }
}