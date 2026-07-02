package saas_access_platform.service;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import saas_access_platform.dto.response.UserResponse;
import saas_access_platform.entity.Role;
import saas_access_platform.repository.RoleRepository;
import saas_access_platform.repository.UserRepository;
import saas_access_platform.repository.UserRoleRepository;
import saas_access_platform.security.CurrentUserContext;

import java.util.List;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;
    private final RoleRepository roleRepository;

    public List<UserResponse> getAllUsers() {
        CurrentUserContext currentUser = (CurrentUserContext)
                SecurityContextHolder.getContext().getAuthentication().getPrincipal();

        return userRepository.findAllByOrgId(currentUser.getOrgId())
                .stream()
                .map(user -> UserResponse.builder()
                        .id(user.getId())
                        .email(user.getEmail())
                        .status(user.getStatus().name())
                        .roles(userRoleRepository.findAllByUserId(user.getId())
                                .stream()
                                .map(ur -> roleRepository.findById(ur.getRoleId())
                                        .map(Role::getName)
                                        .orElse(""))
                                .filter(name -> !name.isEmpty())
                                .toList())
                        .createdAt(user.getCreatedAt())
                        .build())
                .toList();
    }
}